import { PrismaClient } from "@prisma/client";
import { batchCampusWhere } from "../auth/staff-auth";

//schedule notifications helper
//finds notifi where pushStatus->'scheduled and updated them to pending as activated
export async function activateDueScheduledNotifications(db: PrismaClient): Promise<number>{
  const now = new Date();

  //getting noti scheduled for a now time arrived 
  const dueNotifications = await db.notification.findMany({
    where: {
      pushStatus: 'SCHEDULED',
      scheduledFor: { lte: now},
    },
    select: {
      id: true,
      title: true,
      campaignGroupId: true,
      scheduledFor: true
    },
  });

  if(dueNotifications.length===0){ return 0; }

  const ids = dueNotifications.map((n)=>n.id);

  //updating due notifi. scheduled to pending
  const updateResult = await db.notification.updateMany({
    where: {
      id: {in: ids},
      pushStatus: 'SCHEDULED',
    },
    data: {
      pushStatus: 'PENDING'
    }
  });

  console.log(`Scheduled Notification Activated${updateResult.count} having execution time (${now.toISOString()}) arrived`)

  //for trigger immediate dispatch for current 
  try{
    const NUDGE_PORT = Number(process.env.WORKER_NUDGE_PORT || 9099);
    fetch(`http://127.0.0.1:${NUDGE_PORT}/nudge`, {method: 'POST'}).catch(()=>{ })  //if nudge not have port
  }catch{
    //safety ignore for issues
  }

  return updateResult.count;
};

// Cancel all notifications belonging to a scheduled campaign.
// Only notifications still in SCHEDULED state can be cancelled.
export async function cancelScheduledCampaign(
  db: PrismaClient,
  campaignGroupId: string,
  staffId: string,
  isAdmin: boolean
): Promise<{success: boolean; count: number; error?: string}> {

  //matching schedules notifications
  const where: any={
    campaignGroupId,
    pushStatus: 'SCHEDULED',
  }
  
  //admin can campaign they own
  if(!isAdmin){
    where.createdById = staffId;
  }

  const scheduledRows = await db.notification.findMany({
    where,
    select: {id: true},
  })

  if(scheduledRows.length===0){
    return {
      success: false,
      count: 0,
      error: "No scheduled notification for this campaign"
    };
  }

  const ids = scheduledRows.map((r)=> r.id);

  const updateResult = await db.notification.updateMany({
    where: {
      id: {in: ids},
      pushStatus: "SCHEDULED",
    },
    data: {
      pushStatus: "CANCELLED",
    },
  });

  return {
    success: true, 
    count: updateResult.count,
  };
}