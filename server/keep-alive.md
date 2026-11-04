# Keep-Alive Setup (Render Free Tier)

Render's free tier spins down web services after 15 minutes of inactivity, causing a
cold-start delay on the next request. To prevent this, set up a free external cron job
that pings the health endpoint every 14 minutes.

## Steps

1. Go to [cron-job.org](https://cron-job.org) and create a free account.
2. Click **Create cronjob**.
3. Configure:
   - **Title**: `localsys-work keep-alive`
   - **URL**: `https://localsys-work.onrender.com/api/health`
   - **Schedule**: Every 14 minutes (`*/14 * * * *`)
   - **Request method**: `GET`
4. Save the cron job and enable it.
5. Verify the job executes successfully (check the execution history/log in
   cron-job.org after a few minutes) and that it returns a `200 OK` response.

## Notes

- The target server must expose a lightweight `/api/health` endpoint that responds
  quickly without hitting the database unnecessarily.
- 14 minutes is chosen to stay under Render's 15-minute inactivity timeout.
- This is a workaround for the free tier's sleep behavior, not a replacement for
  upgrading to a paid plan if uptime becomes critical.
