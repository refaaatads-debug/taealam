# Bucket privacy: rollout plan (review only, nothing applied)

Buckets: chat-files, support-files (also holds certificates, withdrawal attachments, AI-support uploads), session-recordings (already private in migrations, confirm live).

## What breaks if you only flip the switch
Old rows store full public URLs (chat_messages.file_url, support_messages.file_url, teacher_certificates.file_url, withdrawal_requests.attachment_url). Once the bucket is private those URLs return an error.

## Where the code reads files
- Mobile app: already creates signed URLs for chat-files, support-files, session-recordings and extracts the path from old public URLs (MessagesScreen.tsx chatStoragePath, TeacherFinanceScreens.tsx, profile.tsx, ConnectedSectionScreen.tsx). No app change needed except a quick test.
- Web: still uses getPublicUrl and stores or opens public URLs. Needs a signed-URL change in: pages/Chat.tsx (resolveChatMediaUrl, openFileSafely, upload), pages/LiveSession.tsx (~1553), pages/Profile.tsx (certificate), pages/SupportChat.tsx, components/teacher/WithdrawalSection.tsx, components/support/AIAssistantChat.tsx, components/admin/SupportTicketsTab.tsx, WithdrawalRequestsTab.tsx, TeacherCertificatesList.tsx, ChatNotificationToast.tsx. Pattern: store the object path, not the URL; when displaying, take the path from either an old URL or a plain path, call createSignedUrl(path, 3600), and cache it for the page. I did not write these web edits yet. It is about 10 files and should be tested on a real session, so I did not want to hand you an untested patch. I can write it next if you want.

## Order of operations
1. Apply the SQL policies only (the two CREATE POLICY statements, without the UPDATE ... public = false). Safe, adds read access.
2. Ship the web code that signs URLs (works with both old public URLs and paths while buckets are still public).
3. Check the mobile app is on a build that signs URLs (it does in this repo; check the store version).
4. Take a backup, then flip the buckets to private (the UPDATE). Test chat, support, certificates, withdrawals, recordings on web and mobile.
5. If anything breaks: run the rollback line (buckets back to public). No data is changed by the flip.
6. Later (optional): migrate stored URLs to plain paths.

## Needs your input
- Are any of these files meant to be viewed by unauthenticated people (for example, teacher certificates on a public teacher page)? If so those need a different rule.
- Which web users read other users' certificate files (admins only?).
