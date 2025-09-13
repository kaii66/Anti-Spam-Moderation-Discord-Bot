# 🚫 Anti-Spam-Moderation-Discord-Bot

A powerful **Discord anti-spam and moderation bot** that protects your server from spam attacks  
(text, links, and image-based spam like **MrBeast giveaways, gambling ads, etc.**) while providing  
advanced monitoring and moderation tools.
![Project Logo]([assets/logo.png](https://github.com/sudeshkumars/userimages/blob/main/QUORITH%20OFFICAL%20LOGO.png))

Contact me: Discord:dubbluu 
Email:doubblu@proton.me
---
##  Usage

```bash
node .
node monitor.js
```

That’s it! 🎉

---

## 🔒 Features

### 🛡 Anti-Spam Protection
- Detects spam patterns (**text & image-based**).  
- Instantly **deletes spam messages**.  
- Removes all roles from the spammer (except roles excluded in `config.json`).  
- Option to **ignore certain roles/users**.  
- Applies a **24-hour timeout** (instead of a permanent ban).  
- Sends **DM security notifications** to the user.  
- Reports incidents in a **moderator log channel**.  

### ⚙️ Monitoring & Error Handling
- Built-in **error handler** to catch runtime errors.  
- Includes `monitor.js` to:  
  - Watch the bot’s status.  
  - **Auto-restart** if the bot crashes or stops responding.  
  - Send an alert in your chosen **Discord channel** (with `@ping`) when an error occurs.  

### 🛠 Moderation (current & future)
- **Current**: Auto-spam protection + role removal + timeout.  
- **Future Updates**:  
  - Custom log events for better tracking.  

---

## ⚙️ Configurable Settings (`config.json`)

You can easily configure the bot behavior in `config.json`.

## 📌 Example Workflow

1. A spammer posts a gambling/crypto image ad.  
2. The bot automatically:  
   - Deletes the message.  
   - Removes their roles (except excluded).  
   - Applies a **24-hour timeout**.  
   - Reports the action in your log channel.  
   - Sends the user a **DM with recovery/security guidance**.  
3. If the bot crashes → **auto-restarts** and **notifies moderators**.  

---

## 📢 Coming Soon
- Slash commands for moderation.  
- Customizable punishment system.  
- Web dashboard for managing settings.  

---

## 📜 License

This project is licensed under the **MIT License** – feel free to use and modify it,  
but without any warranty.  
