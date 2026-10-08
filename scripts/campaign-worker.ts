import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import cron from 'node-cron';
import { processCampaignBatch } from '../src/lib/notifications/processCampaignBatch';
//importing activateSchedule
import { activateDueScheduledNotifications } from '../src/lib/notifications/scheduledNotifications';

// Standalone PrismaClient with dedicated pool (independent of Next.js / iisnode)
const prisma = new PrismaClient({
  log: ['error', 'warn'],
});

let isRunning = false; // Single-process concurrency guard

async function runWorkerTick() {
  if (isRunning) {
    console.log('[Worker] Previous tick still in progress. Skipping overlapping run.');
    return;
  }

  isRunning = true;
  try {
    //checking and activate scheduled one if time reached
    const activatedCount = await activateDueScheduledNotifications(prisma);
    if(activatedCount>0){
      console.log(`Worker Activated ${activatedCount} scheduled notifi. that reached execution time`);
    }

    //fetching active one's
    const activeCampaigns = await prisma.notification.findMany({
      where: {
        pushStatus: { in: ['PENDING', 'PROCESSING'] },
      },
      orderBy: { createdAt: 'asc' },
      take: 5,
    });

    if (activeCampaigns.length > 0) {
      console.log(`[Worker] Found ${activeCampaigns.length} active campaign(s) to process.`);
    }

    for (const campaign of activeCampaigns) {
      console.log(`[Worker] Processing campaign "${campaign.title}" (${campaign.id})...`);
      let done = false;
      let iterations = 0;
      const MAX_BATCHES_PER_TICK = 50; // Safety bound (50 * 500 = 25,000 users per tick)

      while (!done && iterations < MAX_BATCHES_PER_TICK) {
        iterations++;
        const result = await processCampaignBatch(prisma, campaign.id, 500);
        done = result.done;
      }

      if (done) {
        console.log(`[Worker] Campaign "${campaign.title}" (${campaign.id}) COMPLETED.`);
      } else {
        console.log(`[Worker] Campaign "${campaign.title}" yielded tick after ${iterations} batches. Will resume next tick.`);
      }
    }
  } catch (err) {
    console.error('[Worker] Error during worker tick:', err);
  } finally {
    isRunning = false;
  }
}

import http from 'http';

const NUDGE_PORT = Number(process.env.WORKER_NUDGE_PORT || 9099);

// Internal HTTP listener for zero-latency campaign nudge requests from Next.js server
const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/nudge') {
    if (isRunning) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, status: 'already_running' }));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, status: 'triggered' }));
      runWorkerTick().catch((err) => console.error('[Worker Nudge Error]', err));
    }
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(NUDGE_PORT, '127.0.0.1', () => {
  console.log(`📡 Internal Worker Nudge Listener active at http://127.0.0.1:${NUDGE_PORT}/nudge`);
});

// Schedule tick every 1 minute
console.log('═══════════════════════════════════════════════════════');
console.log('🚀 Alumni Portal Notification Campaign Worker Started');
console.log(`🕒 Schedule: Every minute (*/1 * * * *) | Nudge Port: ${NUDGE_PORT}`);
console.log('═══════════════════════════════════════════════════════');

cron.schedule('*/1 * * * *', async () => {
  await runWorkerTick();
});

// Run immediate first tick upon service start
runWorkerTick();

// Graceful shutdown handling
const shutdown = async () => {
  console.log('[Worker] Shutting down campaign worker...');
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('unhandledRejection', (err) => {
  console.error('[Worker] Unhandled rejection in worker:', err);
});
process.on('uncaughtException', (err) => {
  console.error('[Worker] Uncaught exception in worker:', err);
});
