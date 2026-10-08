import { NextResponse } from 'next/server';
import { getCurrentAlumni } from '@/lib/auth/getCurrentAlumni';
import { prisma } from '@/lib/prisma';
import { PushDeliveryStatus } from '@prisma/client';
import { getAlumniAudienceTags } from '@/lib/notifications/tags';

export async function GET() {
  try {
    const alumni = await getCurrentAlumni();
    if (!alumni) {
      return NextResponse.json({ unreadCount: 0 });
    }

    const alumniWithCampus = await prisma.alumni.findUnique({
      where: { id: alumni.id },
      select: {
        id: true,
        batchYear: true,
        branch: true,
        course: true,
        notificationsReadAt: true,
        createdAt: true,
        registeredAt: true,
        campus: { select: { code: true } }
      }
    });

    if (!alumniWithCampus) {
      return NextResponse.json({ unreadCount: 0 });
    }

    // Map campus.code to campusCode for getAlumniAudienceTags
    const alumniData = {
      id: alumniWithCampus.id,
      campusCode: alumniWithCampus.campus.code,
      batchYear: alumniWithCampus.batchYear,
      branch: alumniWithCampus.branch,
      course: alumniWithCampus.course
    };

    const followedCommunities = await prisma.communityMember.findMany({
      where: { alumniId: alumni.id },
      select: { communityId: true, isFollowingNewsletter: true }
    });

    const userTags = getAlumniAudienceTags(
      alumniData,
      followedCommunities
    );

    const readThreshold = alumniWithCampus.notificationsReadAt ?? alumniWithCampus.registeredAt ?? alumniWithCampus.createdAt;

    const now = new Date();

    //again visibility filtering for unread notifi. counts 
    //alumni unread count can't update before delivery
    const unreadCount = await prisma.notification.count({
      where: {
        audienceTag: { in: userTags },
        createdAt: { gt: readThreshold },
        userStates: {
          none: {
            userId: alumni.id,
            isDeleted: true
          }
        },
        AND: [
          {
            OR: [
              { pushStatus: null},
              { pushStatus: { notIn: [PushDeliveryStatus.SCHEDULED, PushDeliveryStatus.CANCELLED]}}
            ]
          },
          {
            OR: [
              { scheduledFor: null},
              { scheduledFor: { lte: now }}
            ]
          }
        ]
      }
    });

    return NextResponse.json({ unreadCount });
  } catch (err) {
    console.error('Error fetching unread notification count:', err);
    return NextResponse.json({ unreadCount: 0 });
  }
}
