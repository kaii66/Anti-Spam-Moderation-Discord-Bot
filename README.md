# Anti-Spam-Moderation-Discord-Bot
A powerful Discord anti-spam and moderation bot that protects your server from spam attacks (text, links, and image-based spam like MrBeast giveaways, gambling ads, etc.) while providing advanced monitoring and moderation tools.



🔒 Features
🛡 Anti-Spam Protection

● Detects spam patterns (text & image-based).

● Instantly deletes spam messages.

● Removes all roles from the spammer (except roles excluded in config.json).

● Option to ignore certain roles/users.

● Applies a 24-hour timeout (instead of a permanent ban).

● Sends DM security notifications to the user.

● Reports incidents in a moderator log channel.


⚙️ Monitoring & Error Handling

● Built-in error handler to catch runtime errors.

● Includes monitor.js to:

● Watch the bot’s status.

● Auto-restart if the bot crashes or stops responding.

● Send an alert in your chosen Discord channel (with @ping) when an error occurs.

🛠 Moderation (current & future)

Current: Auto-spam protection + role removal + timeout.

Future Updates:

More moderation commands (kick, ban, warn, clear, slowmode, etc.).

Custom log events for better tracking.


Configurable Settings (config.json)

● Roles to exclude from removal.

● Users/roles to ignore.

● Log channel for error/incident reports.

● Moderator role for notifications.

● Sensitivity level for spam detection.



