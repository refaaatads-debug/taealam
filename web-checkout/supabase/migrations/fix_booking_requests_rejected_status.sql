-- Migration: add "rejected" to booking_requests.status check constraint
-- Date: 2026-05-12
-- Reason: reject_booking_request RPC was returning 422 because "rejected" was
--         not in the allowed status values. Allowed were: open, accepted, expired, cancelled.
ALTER TABLE public.booking_requests
  DROP CONSTRAINT booking_requests_status_check,
  ADD CONSTRAINT booking_requests_status_check
    CHECK (status = ANY (ARRAY['open'::text, 'accepted'::text, 'expired'::text, 'cancelled'::text, 'rejected'::text]));
