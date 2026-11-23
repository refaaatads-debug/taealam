
-- Link booking to subscription
UPDATE bookings 
SET used_subscription = true, subscription_id = '3ea97613-bbed-4e0b-954b-209f2744935e'
WHERE id = '916ac011-2c89-4242-ac12-30decf14180b';

-- Start session (6 minutes ago)
UPDATE sessions 
SET started_at = now() - interval '6 minutes'
WHERE booking_id = '916ac011-2c89-4242-ac12-30decf14180b';

-- End session (now) - triggers auto_complete_session for deduction + earnings
UPDATE sessions 
SET ended_at = now()
WHERE booking_id = '916ac011-2c89-4242-ac12-30decf14180b';
