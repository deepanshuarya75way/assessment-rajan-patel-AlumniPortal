import { prisma } from '@/lib/prisma';
import { NotificationChannel, NotificationType, PushDeliveryStatus, Prisma } from '@prisma/client';
import { generateCampaignTags } from './tags';
import { sendPush } from '../push/send';
import { buildAlumniWhere } from './buildAlumniWhere';
import { normalizeRoutePath } from './formats';
import crypto from 'crypto';

export interface TriggerNotificationOptions {
  type: NotificationType;
  channel: NotificationChannel;
  title: string;
  body: string;
  url?: string | null;
  metadata?: Record<string, unknown> | null;
  
  // Recipient targeting
  userId?: string;
  filter?: any;
  customTag?: string;
  
  createdById?: string;
  staffRole?: string;
  staffCampusId?: string;

  //optional cuzz maybe time passed not future
  scheduledFor?: Date | string | null;
}

export async function triggerNotification(options: TriggerNotificationOptions) {
  const { type, channel, title, body, url, metadata, userId, filter, customTag, createdById, staffRole, staffCampusId, scheduledFor } = options;
  const normalizedUrl = url ? normalizeRoutePath(url) : null;

  //check for scheduled date/time
  const targetScheduledDate = scheduledFor ? new Date(scheduledFor): null;

  //if for future -> keping scheuled and 
  const isScheduledForFuture = targetScheduledDate !== null && 
  targetScheduledDate.getTime() > Date.now() &&
  isNaN(targetScheduledDate.getTime());

  let combos: { tag: string; scopedFilter: any }[] = [];
  let targetUserId: string | null = null;
  let scopedFilter = filter ? { ...filter } : null;
  if (scopedFilter && (scopedFilter.campusId === 'all' || scopedFilter.campusId === '')) {
    scopedFilter.campusId = null;
  }

  // 1. Enforce Server-Side Campus Scoping Security (even if no filter is supplied)
  if (staffRole && staffRole !== 'ADMIN' && staffCampusId) {
    if (!scopedFilter) {
      scopedFilter = {};
    }
    scopedFilter.campusId = staffCampusId;
  }

  // 2. Resolve short campus code if targeting campus
  let campusCode: string | null = null;
  if (scopedFilter?.campusId && scopedFilter.campusId !== 'all') {
    const campus = await prisma.campus.findUnique({
      where: { id: String(scopedFilter.campusId) },
      select: { code: true }
    });
    if (campus) {
      campusCode = campus.code;
    }
  }

  // 3. Resolve target tag combos
  if (userId) {
    targetUserId = userId;
    combos = [{ tag: `user:${userId}`, scopedFilter: null }];
  } else if (customTag) {
    combos = [{ tag: customTag, scopedFilter: null }];
  } else if (scopedFilter) {
    combos = generateCampaignTags(scopedFilter, campusCode);
  } else {
    combos = [{ tag: 'alumni:all', scopedFilter: null }];
  }

  // Generate shared campaignGroupId for multi-combo grouping
  const campaignGroupId = userId ? null : crypto.randomUUID();

  ///setting required push delivery status: future -> scheduled, current -> pending 
  let pushStatus: PushDeliveryStatus | null = null;
  if(isScheduledForFuture){
    pushStatus='SCHEDULED';
  }else if(channel === 'PUSH_AND_INAPP') {
    pushStatus = userId ? null : 'PENDING';
  }

  // 4. Create Notification rows (one per scoped batch year / campus combo)
  const notifications = await Promise.all(
    combos.map(async (combo) => {
      let totalTargets = 0;
      if ((channel === 'PUSH_AND_INAPP' && isScheduledForFuture) && !userId && combo.scopedFilter) {
        const where = buildAlumniWhere(combo.scopedFilter);
        totalTargets = await prisma.alumni.count({ where });
      }

      return prisma.notification.create({
        data: {
          type,
          title,
          body,
          url: normalizedUrl || null,
          metadata: (metadata as Prisma.InputJsonValue) ?? Prisma.DbNull,
          audienceTag: combo.tag,
          targetUserId,
          channel,
          filter: (combo.scopedFilter as Prisma.InputJsonValue) ?? Prisma.DbNull,
          pushStatus,
          totalTargets: totalTargets || null,
          createdById: createdById || null,
          campaignGroupId,
          //saving
          scheduledFor: isScheduledForFuture ? targetScheduledDate : null,
        },
      });
    })
  );

  // for future not dispatch and for actiavte for reached
  // 5. Dispatch immediately if unicast push is enabled, otherwise nudge worker
  if (isScheduledForFuture && channel === 'PUSH_AND_INAPP') {
    if (userId) {
      try {
        const subs = await prisma.pushSubscription.findMany({
          where: { userId },
          select: { endpoint: true, p256dh: true, auth: true },
        });
        if (subs.length > 0) {
          const results = await Promise.allSettled(
            subs.map((s) => sendPush(s, { title, body, url: normalizedUrl || undefined }))
          );
          const expired = subs
            .filter((_, i) => {
              const r = results[i];
              return r.status === 'fulfilled' && !r.value.ok && r.value.expired;
            })
            .map((s) => s.endpoint);

          if (expired.length > 0) {
            await prisma.pushSubscription.deleteMany({
              where: { endpoint: { in: expired } },
            });
          }
        }
      } catch (err) {
        console.error('[triggerNotification] Inline push failed:', err);
      }
    } else {
      // Nudge background campaign worker (now with current campaigns al)
      const NUDGE_PORT = Number(process.env.WORKER_NUDGE_PORT || 9099);
      fetch(`http://127.0.0.1:${NUDGE_PORT}/nudge`, { method: 'POST' }).catch((nudgeErr) => {
        console.warn('[triggerNotification] Worker nudge failed:', nudgeErr.message || nudgeErr);
      });
    }
  }

  return notifications[0];
}
