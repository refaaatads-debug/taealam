# Exact VPS source capture, 24 November 2026 08:29 Riyadh

Archive-only branch, no build, merge or deployment. Source files under their labelled folders are byte-for-byte from the VPS at capture, verified by manifest SHA256. This archive deliberately has no GitHub workflow files. It is not a runnable release branch.

web-checkout is the old dirty repository source, not proof of the source of the compiled production frontend. web-running-functions is actual mounted runtime code. served-web/index.html is actual served HTML; all525served artifact hashes are in manifest, existing compiled assets are not copied.

Excluded: env/credentials, databases/customer files, dependency caches/node_modules, git metadata, logs/backups, SSH/system configs. No migration was run. No server file or service was changed. This snapshot does not replace current main or replit-dev and must not be merged wholesale over their newer fixes.
