// commands/antispam.js
const { EmbedBuilder, PermissionsBitField } = require('discord.js');

class AntiSpamSystem {
    constructor(client, config) {
        this.client = client;
        this.config = config;
        this.userMessageHistory = new Map(); // Store recent user messages
        this.userOriginalRoles = new Map(); // Store original user roles for appeals
        
        // Suspicious domain patterns
        this.suspiciousDomains = [
            'bit.ly', 'tinyurl.com', 'goo.gl', 't.co', 'ow.ly', 'short.link',
            'discord.gg', 'discordapp.com/invite', 'discord.com/invite',
            'steampowered.com', 'steamcommunity.com' // Common phishing targets
        ];
        
        // URL regex pattern
        this.urlPattern = /(https?:\/\/[^\s]+)/gi;
        
        // Clear old message history every 5 minutes
        setInterval(() => {
            this.cleanupMessageHistory();
        }, 300000);
    }

    // Initialize the anti-spam system
    initialize() {
        console.log('🛡️ Enhanced Anti-Spam System initialized with link detection');
        
        this.client.on('messageCreate', async (message) => {
            if (message.author.bot) return;
            if (!this.config.antiSpam?.enabled) return;
            
            await this.checkMessage(message);
        });
    }

    // Extract URLs from message content
    extractUrls(content) {
        const urls = content.match(this.urlPattern) || [];
        return urls.map(url => {
            try {
                const urlObj = new URL(url);
                return {
                    full: url,
                    domain: urlObj.hostname.toLowerCase(),
                    isSuspicious: this.isSuspiciousDomain(urlObj.hostname)
                };
            } catch (error) {
                return {
                    full: url,
                    domain: url,
                    isSuspicious: true // Malformed URLs are suspicious
                };
            }
        });
    }

    // Check if domain is suspicious
    isSuspiciousDomain(hostname) {
        const domain = hostname.toLowerCase();
        
        // Check against suspicious domains
        if (this.suspiciousDomains.some(suspicious => domain.includes(suspicious))) {
            return true;
        }
        
        // Check if it's in trusted domains (if configured)
        if (this.config.antiSpam.trustedDomains?.length > 0) {
            return !this.config.antiSpam.trustedDomains.some(trusted => 
                domain.includes(trusted.toLowerCase())
            );
        }
        
        // Check for URL shorteners and suspicious patterns
        if (domain.length < 6 || domain.includes('.tk') || domain.includes('.ml')) {
            return true;
        }
        
        return false;
    }

    // Main message checking function
    async checkMessage(message) {
        try {
            const userId = message.author.id;
            const guildId = message.guild.id;
            
            // Check if user is exempt
            if (this.isExemptUser(message.author, message.member)) {
                return;
            }

            // Extract URLs from message
            const urls = this.extractUrls(message.content);

            // Get user's recent messages
            if (!this.userMessageHistory.has(userId)) {
                this.userMessageHistory.set(userId, []);
            }
            
            const userHistory = this.userMessageHistory.get(userId);
            const now = Date.now();
            
            // Add current message to history
            userHistory.push({
                timestamp: now,
                attachments: message.attachments.size,
                hasEveryone: message.content.includes('@everyone') || message.content.includes('@here'),
                messageId: message.id,
                channelId: message.channel.id,
                content: message.content,
                urls: urls,
                urlCount: urls.length,
                suspiciousUrls: urls.filter(url => url.isSuspicious).length
            });

            // Check for spam pattern
            const isSpam = this.detectSpamPattern(userHistory, message);
            
            if (isSpam) {
                await this.handleSpamDetection(message);
            }

        } catch (error) {
            console.error('❌ Error in anti-spam check:', error);
        }
    }

    // Enhanced spam detection - includes link spam
    detectSpamPattern(userHistory, currentMessage) {
        const now = Date.now();
        const timeWindow = this.config.antiSpam.timeWindow || 30000; // 30 seconds
        const imageThreshold = this.config.antiSpam.imageThreshold || 2;
        const linkThreshold = this.config.antiSpam.linkThreshold || 3;
        
        // Get recent messages within time window
        const recentMessages = userHistory.filter(msg => 
            (now - msg.timestamp) <= timeWindow
        );

        // Get unique channels from recent messages
        const uniqueChannels = new Set(recentMessages.map(msg => msg.channelId));
        const channelCount = uniqueChannels.size;

        // Count various spam indicators
        const totalImages = recentMessages.reduce((sum, msg) => sum + msg.attachments, 0);
        const totalLinks = recentMessages.reduce((sum, msg) => sum + msg.urlCount, 0);
        const suspiciousLinks = recentMessages.reduce((sum, msg) => sum + msg.suspiciousUrls, 0);
        
        // Check for @everyone with images across multiple channels
        const everyoneMessages = recentMessages.filter(msg => msg.hasEveryone);
        const everyoneWithImages = everyoneMessages.filter(msg => msg.attachments > 0);
        const everyoneWithLinks = everyoneMessages.filter(msg => msg.urlCount > 0);

        console.log(`🔍 Enhanced spam check for ${currentMessage.author.tag}:`);
        console.log(`   - Recent messages: ${recentMessages.length}`);
        console.log(`   - Unique channels: ${channelCount}`);
        console.log(`   - Total images: ${totalImages}`);
        console.log(`   - Total links: ${totalLinks}`);
        console.log(`   - Suspicious links: ${suspiciousLinks}`);
        console.log(`   - @everyone messages: ${everyoneMessages.length}`);
        console.log(`   - @everyone with images: ${everyoneWithImages.length}`);
        console.log(`   - @everyone with links: ${everyoneWithLinks.length}`);

   // Pattern 1: @everyone with suspicious content across multiple channels (HIGHEST PRIORITY)
        if ((everyoneWithImages.length > 0 || everyoneWithLinks.length > 0) && channelCount >= 2) {
            console.log('🚨 SPAM DETECTED: @everyone with suspicious content across multiple channels');
            return true;
        }

        // Pattern 2: Suspicious link spam across multiple channels
        if (suspiciousLinks >= 2 && channelCount >= 2) {
            console.log('🚨 SPAM DETECTED: Suspicious links across multiple channels');
            return true;
        }

        // Pattern 3: Rapid multi-channel image posting (4+ images across 2+ channels)
        if (totalImages >= 4 && channelCount >= 2) {
            console.log('🚨 SPAM DETECTED: Multiple images across multiple channels');
            return true;
        }

        // Pattern 4: Link spam pattern (3+ links across 2+ channels)
        if (totalLinks >= linkThreshold && channelCount >= 2) {
            console.log('🚨 SPAM DETECTED: Multiple links across multiple channels');
            return true;
        }

        // Pattern 5: Mass @everyone across multiple channels (even without media)
        if (everyoneMessages.length >= 3 && channelCount >= 2) {
            console.log('🚨 SPAM DETECTED: Mass @everyone across multiple channels');
            return true;
        }

        // Pattern 6: Extremely rapid posting (5+ messages in 10 seconds across multiple channels)
        const veryRecentMessages = recentMessages.filter(msg => 
            (now - msg.timestamp) <= 10000 // 10 seconds
        );
        const veryRecentChannels = new Set(veryRecentMessages.map(msg => msg.channelId));
        
        if (veryRecentMessages.length >= 5 && veryRecentChannels.size >= 2) {
            console.log('🚨 SPAM DETECTED: Rapid posting across multiple channels');
            return true;
        }

        // Pattern 7: Suspicious link with @everyone across multiple channels (immediate threat)
        if (suspiciousLinks >= 1 && everyoneMessages.length >= 1 && channelCount >= 3) {
            console.log('🚨 SPAM DETECTED: Suspicious link with @everyone across multiple channels');
            return true;
        }

        console.log('✅ No spam pattern detected');
        return false;
    }

    // Handle detected spam
    async handleSpamDetection(message) {
        try {
            console.log(`🚨 Spam detected from user: ${message.author.tag} (${message.author.id})`);
            
            const member = message.member;
            if (!member) return;

            // Store original roles before removing them
            this.userOriginalRoles.set(message.author.id, {
                roles: member.roles.cache.map(role => role.id),
                timestamp: Date.now(),
                reason: 'Anti-spam detection',
                userTag: message.author.tag
            });

            // Delete spam messages
            await this.deleteSpamMessages(message.author.id, message.guild);

            // Apply timeout and role changes
            await this.applyPunishment(member);

            // Send user notification in separate channel
            await this.sendUserNotification(message.author, message.guild);

            // Send DM to user
            await this.sendUserDM(message.author);

            // Log the incident (with enhanced logging)
            await this.logIncident(message.author, member, message.guild);

            // Send server alert
            await this.sendServerAlert(message.author, message.guild);

        } catch (error) {
            console.error('❌ Error handling spam detection:', error);
        }
    }

    // Send user notification in separate channel
    async sendUserNotification(user, guild) {
        try {
            if (!this.config.antiSpam.notificationChannelId) {
                console.log('⚠️ No notification channel configured');
                return;
            }

            const channel = await this.client.channels.fetch(this.config.antiSpam.notificationChannelId);
            
           const message = `${user}\n > Your account has been temporarily suspended for 24 hours due to detected spam activity or security concerns. During this time, you cannot view or send messages. Please wait for the timeout period to end. Contact support if you believe this is an error.`;
            
            await channel.send(message);
            console.log(`📢 Sent notification to ${user.tag} in notification channel`);
            
        } catch (error) {
            console.error('❌ Error sending user notification:', error);
        }
    }

    // Delete recent spam messages from user
    async deleteSpamMessages(userId, guild) {
        try {
            const userHistory = this.userMessageHistory.get(userId) || [];
            const now = Date.now();
            const timeWindow = this.config.antiSpam.timeWindow || 30000;

            // Get recent message IDs
            const recentMessages = userHistory.filter(msg => 
                (now - msg.timestamp) <= timeWindow
            );

            let deletedCount = 0;
            for (const msgData of recentMessages) {
                try {
                    const channel = await guild.channels.fetch(msgData.channelId);
                    if (channel) {
                        const message = await channel.messages.fetch(msgData.messageId);
                        await message.delete();
                        deletedCount++;
                        console.log(`🗑️ Deleted spam message: ${msgData.messageId} in #${channel.name}`);
                    }
                } catch (error) {
                    console.log(`⚠️ Could not delete message ${msgData.messageId}:`, error.message);
                }
            }
            
            console.log(`🗑️ Deleted ${deletedCount}/${recentMessages.length} spam messages`);
        } catch (error) {
            console.error('❌ Error deleting spam messages:', error);
        }
    }

    // Enhanced punishment application with better error handling
    async applyPunishment(member) {
        try {
            const timeoutDuration = this.config.antiSpam.timeoutDuration || 86400000; // 24 hours
            const preserveRoles = this.config.antiSpam.preserveRoles || [];
            const compromisedRoleId = this.config.antiSpam.compromisedRoleId;

            console.log(`🔧 Applying punishment to ${member.user.tag}`);

            // Check bot permissions
            const botMember = member.guild.members.me;
            if (!botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
                console.error('❌ Bot lacks MANAGE_ROLES permission');
                return;
            }

            if (!botMember.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
                console.error('❌ Bot lacks MODERATE_MEMBERS permission');
                return;
            }

            // Check if compromised role exists and is manageable
            let compromisedRole = null;
            if (compromisedRoleId) {
                try {
                    compromisedRole = await member.guild.roles.fetch(compromisedRoleId);
                    if (!compromisedRole) {
                        console.error(`❌ Compromised role ${compromisedRoleId} not found`);
                    } else if (compromisedRole.position >= botMember.roles.highest.position) {
                        console.error(`❌ Compromised role ${compromisedRole.name} is higher than bot's highest role`);
                        compromisedRole = null;
                    }
                } catch (error) {
                    console.error(`❌ Error fetching compromised role:`, error.message);
                }
            }

            // Remove all roles except preserved ones and @everyone
            const rolesToRemove = member.roles.cache.filter(role => 
                !preserveRoles.includes(role.id) && 
                role.id !== member.guild.id && // Don't remove @everyone
                role.position < botMember.roles.highest.position // Only remove manageable roles
            );

            console.log(`🗑️ Removing ${rolesToRemove.size} roles from ${member.user.tag}`);
            
            for (const role of rolesToRemove.values()) {
                try {
                    await member.roles.remove(role, 'Anti-spam: Compromised account detected');
                    console.log(`   ✅ Removed role: ${role.name}`);
                } catch (error) {
                    console.log(`   ❌ Could not remove role ${role.name}: ${error.message}`);
                }
            }

            // Add compromised account role
            if (compromisedRole) {
                try {
                    await member.roles.add(compromisedRole, 'Anti-spam: Compromised account detected');
                    console.log(`✅ Added compromised role: ${compromisedRole.name}`);
                } catch (error) {
                    console.error(`❌ Could not add compromised role: ${error.message}`);
                }
            } else {
                console.log(`⚠️ No compromised role to add`);
            }

            // Apply timeout
            try {
                await member.timeout(timeoutDuration, 'Anti-spam: Compromised account detected');
                console.log(`⏰ Applied ${timeoutDuration/1000/60} minute timeout to ${member.user.tag}`);
            } catch (error) {
                console.error(`❌ Could not apply timeout: ${error.message}`);
            }

        } catch (error) {
            console.error('❌ Error applying punishment:', error);
        }
    }

    // Send DM to affected user
    async sendUserDM(user) {
        try {
            const embed = new EmbedBuilder()
                .setTitle('🔒 Account Security Alert')
                .setColor('#0000FF')
                .setDescription([
                    '**Your account has been temporarily restricted due to suspicious activity.**',
                    '',
                    '🚨 **What happened?**',
                    'Our security system detected potential spam/malicious activity from your account, including:',
                    '• Multiple image attachments with mass pings across channels',
                    '• Suspicious link sharing across multiple channels',
                    '• Pattern consistent with compromised accounts',
                    '',
                    '🛡️ **Your account may be compromised**',
                    'This usually happens when:',
                    '• Your password was leaked or guessed',
                    '• You clicked on a malicious link or downloaded malware',
                    '• Your account was accessed by unauthorized persons',
                    '',
                    '🔧 **What you should do:**',
                    '1. **Change your Discord password immediately**',
                    '2. **Enable 2FA on your account**',
                    '3. **Run antivirus scan on your device**',
                    '4. **Check for unauthorized applications in Discord settings**',
                    '5. **Log out of Discord on all devices and log back in**',
                    '',
                    `📞 **Appeal Process:**`,
                    `Once you've secured your account, you can appeal to restore your roles in the appeals channel.`,
                    '',
                    '⏰ **Timeout Duration:** 24 hours',
                    '**This is for your protection and server safety.**'
                ].join('\n'))
                .setFooter({ 
                    text: 'This is an automated security measure ©DUBBLU',
                    iconURL: user.displayAvatarURL() 
                })
                .setTimestamp();

            await user.send({ embeds: [embed] });
            console.log(`📧 Sent security DM to ${user.tag}`);
            
        } catch (error) {
            console.log(`⚠️ Could not send DM to ${user.tag}:`, error.message);
            
            // Log DM failure if channel is configured
            if (this.config.antiSpam.dmFailLogChannelId) {
                try {
                    const channel = await this.client.channels.fetch(this.config.antiSpam.dmFailLogChannelId);
                    const failEmbed = new EmbedBuilder()
                        .setTitle('📧 DM Delivery Failed')
                        .setColor('#FFA500')
                        .addFields([
                            { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
                            { name: 'User Mention', value: `${user}`, inline: true },
                            { name: 'Reason', value: error.message, inline: false }
                        ])
                        .setTimestamp();
                    
                    await channel.send({ embeds: [failEmbed] });
                } catch (logError) {
                    console.error('❌ Error logging DM failure:', logError);
                }
            }
        }
    }

    // Enhanced incident logging with user roles
    async logIncident(user, member, guild) {
        try {
            if (!this.config.antiSpam.logChannelId) return;

            const channel = await this.client.channels.fetch(this.config.antiSpam.logChannelId);
            
            // Get recent activity summary
            const userHistory = this.userMessageHistory.get(user.id) || [];
            const recentMessages = userHistory.filter(msg => 
                (Date.now() - msg.timestamp) <= (this.config.antiSpam.timeWindow || 30000)
            );
            
            const uniqueChannels = new Set(recentMessages.map(msg => msg.channelId));
            const totalImages = recentMessages.reduce((sum, msg) => sum + msg.attachments, 0);
            const totalLinks = recentMessages.reduce((sum, msg) => sum + msg.urlCount, 0);
            const suspiciousLinks = recentMessages.reduce((sum, msg) => sum + msg.suspiciousUrls, 0);
            const everyoneCount = recentMessages.filter(msg => msg.hasEveryone).length;
            
            // Get user roles
            const userRoles = member.roles.cache
                .filter(role => role.id !== guild.id) // Remove @everyone
                .sort((a, b) => b.position - a.position)
                .map(role => role.toString())
                .slice(0, 10); // Limit to 10 roles to avoid embed limits
            
            const roleText = userRoles.length > 0 ? userRoles.join(', ') : 'No roles';
            const roleCount = member.roles.cache.size - 1; // Exclude @everyone
            
            const embed = new EmbedBuilder()
                .setTitle('🚨 Enhanced Multi-Channel Spam Detection')
                .setColor('#0000FF')
                .setThumbnail(user.displayAvatarURL())
                .addFields([
                    { name: '👤 User Info', value: `**Tag:** ${user.tag}\n**ID:** \`${user.id}\`\n**Mention:** ${user}`, inline: true },
                    { name: '📅 Account Info', value: `**Created:** <t:${Math.floor(user.createdTimestamp/1000)}:R>\n**Joined:** ${member.joinedAt ? `<t:${Math.floor(member.joinedAt.getTime()/1000)}:R>` : 'Unknown'}`, inline: true },
                    { name: '🎭 User Roles', value: `**Count:** ${roleCount}\n**Top Roles:** ${roleText}`, inline: false },
                    { name: '📊 Activity Summary', value: [
                        `• Messages: ${recentMessages.length}`,
                        `• Channels: ${uniqueChannels.size}`,
                        `• Images: ${totalImages}`,
                        `• Links: ${totalLinks}`,
                        `• Suspicious Links: ${suspiciousLinks}`,
                        `• @everyone: ${everyoneCount}`
                    ].join('\n'), inline: true },
                    { name: '🎯 Detection Reason', value: 'Multi-channel spam pattern detected\nIncludes suspicious links and/or mass pings\nConsistent with compromised account behavior', inline: true },
                    { name: '⚡ Actions Taken', value: [
                        '• Spam messages deleted across channels',
                        '• User timed out (24h)',
                        '• Roles removed and stored for restoration',
                        '• Compromised account role added',
                        '• Security notification sent to user',
                        '• User notified in notification channel'
                    ].join('\n'), inline: false },
                    { name: '🔧 Next Steps', value: 'User can appeal once account is secured ©DUBBLU', inline: false }
                ])
                .setFooter({ 
                    text: `Enhanced Anti-Spam System • ${guild.name}`,
                    iconURL: guild.iconURL() 
                })
                .setTimestamp();

            await channel.send({ embeds: [embed] });
            
        } catch (error) {
            console.error('❌ Error logging incident:', error);
        }
    }

    // Send server alert
    async sendServerAlert(user, guild) {
        try {
            if (!this.config.antiSpam.alertChannelId) return;

            const channel = await this.client.channels.fetch(this.config.antiSpam.alertChannelId);
            
            const embed = new EmbedBuilder()
                .setTitle('🔒 Compromised Account Detected')
                .setColor('#FFA500')
                .setDescription([
                    `**${user.tag}** (${user}) has been temporarily restricted due to suspicious multi-channel spam activity.`,
                    '',
                    '🚨 **Their account appears to be compromised** and was posting spam content (images/links) across multiple channels with mass pings.',
                    '',
                    '🛡️ **Security measures applied:**',
                    '• Account timed out for 24 hours',
                    '• Roles temporarily removed and stored',
                    '• Compromised account role applied',
                    '• User notified about the security issue',
                    '• Spam messages cleaned up',
                    '',
                    `📞 **If this is your friend:** Let them know their account may be hacked and they should secure it immediately.`,
                    '',
                    `🎫 **Appeal process:** Once secured, they can appeal in the designated channel.`
                ].join('\n'))
                .setFooter({ 
                    text: 'This is an automated security response ©DUBBLU',
                    iconURL: guild.iconURL() 
                })
                .setTimestamp();

            await channel.send({ embeds: [embed] });
            
        } catch (error) {
            console.error('❌ Error sending server alert:', error);
        }
    }

    // Check if user is exempt from anti-spam
    isExemptUser(user, member) {
        // Check exempt users
        if (this.config.antiSpam.exemptUsers?.includes(user.id)) {
            return true;
        }

        // Check exempt roles
        if (member && this.config.antiSpam.exemptRoles) {
            const hasExemptRole = member.roles.cache.some(role => 
                this.config.antiSpam.exemptRoles.includes(role.id)
            );
            if (hasExemptRole) return true;
        }

        return false;
    }

    // Clean up old message history
    cleanupMessageHistory() {
        const now = Date.now();
        const maxAge = 3600000; // 1 hour

        for (const [userId, messages] of this.userMessageHistory.entries()) {
            const filteredMessages = messages.filter(msg => 
                (now - msg.timestamp) <= maxAge
            );
            
            if (filteredMessages.length === 0) {
                this.userMessageHistory.delete(userId);
            } else {
                this.userMessageHistory.set(userId, filteredMessages);
            }
        }

        console.log(`🧹 Cleaned up old message history - tracking ${this.userMessageHistory.size} users`);
    }

    // Manual commands for staff
    async handleAntiSpamCommand(message, args, config) {
        const hasPermission = message.member.roles.cache.some(role => 
            this.config.logperms?.includes(role.id)
        );
        if (!hasPermission) {
            return message.reply('❌ You don\'t have permission to use anti-spam commands.');
        }

        const subCommand = args[0]?.toLowerCase();

        switch (subCommand) {
            case 'status':
                await this.showStatus(message);
                break;
                
            case 'restore':
                await this.restoreUserRoles(message, args[1]);
                break;
                
            case 'toggle':
                await this.toggleSystem(message);
                break;

            case 'debug':
                await this.debugUser(message, args[1]);
                break;
                
            default:
                const embed = new EmbedBuilder()
                    .setTitle('🛡️ Enhanced Anti-Spam Commands')
                    .setColor('#0099FF')
                    .addFields([
                        { name: '📊 Status', value: '`!antispam status` - Show system status', inline: false },
                        { name: '🔄 Restore', value: '`!antispam restore <user_id>` - Restore user roles', inline: false },
                        { name: '🔧 Toggle', value: '`!antispam toggle` - Enable/disable system', inline: false },
                        { name: '🐛 Debug', value: '`!antispam debug <user_id>` - Show user activity', inline: false }
                    ])
                    .setFooter({ text: 'Enhanced Anti-Spam Management System ©DUBBLU' });
                
                await message.reply({ embeds: [embed] });
        }
    }

    // Show enhanced system status
    async showStatus(message) {
        const embed = new EmbedBuilder()
            .setTitle('🛡️ Enhanced Anti-Spam System Status')
            .setColor(this.config.antiSpam?.enabled ? '#00FF00' : '#FF0000')
            .addFields([
                { name: 'Status', value: this.config.antiSpam?.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
                { name: 'Image Threshold', value: `${this.config.antiSpam?.imageThreshold || 2} images`, inline: true },
                { name: 'Link Threshold', value: `${this.config.antiSpam?.linkThreshold || 3} links`, inline: true },
                { name: 'Time Window', value: `${(this.config.antiSpam?.timeWindow || 30000)/1000}s`, inline: true },
                { name: 'Active Histories', value: `${this.userMessageHistory.size} users`, inline: true },
                { name: 'Stored Roles', value: `${this.userOriginalRoles.size} users`, inline: true },
                { name: 'Detection Types', value: [
                    '• Multi-channel image spam',
                    '• Suspicious link sharing',
                    '• Mass @everyone/here pings',
                    '• Rapid cross-channel posting'
                ].join('\n'), inline: false },
                { name: 'Channels', value: [
                    `Log: ${this.config.antiSpam?.logChannelId ? `<#${this.config.antiSpam.logChannelId}>` : '❌ Not set'}`,
                    `Alert: ${this.config.antiSpam?.alertChannelId ? `<#${this.config.antiSpam.alertChannelId}>` : '❌ Not set'}`,
                    `Notification: ${this.config.antiSpam?.notificationChannelId ? `<#${this.config.antiSpam.notificationChannelId}>` : '❌ Not set'}`
                ].join('\n'), inline: false },
                { name: 'Compromised Role', value: this.config.antiSpam?.compromisedRoleId ? `<@&${this.config.antiSpam.compromisedRoleId}>` : '❌ Not set', inline: true },
                { name: 'Trusted Domains', value: this.config.antiSpam?.trustedDomains?.length > 0 ? `${this.config.antiSpam.trustedDomains.length} domains` : '❌ None set', inline: true }
            ])
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    }

    // Debug user activity with enhanced info
    async debugUser(message, userId) {
        if (!userId) {
            return message.reply('❌ Please provide a user ID: `!antispam debug <user_id>`');
        }

        const userHistory = this.userMessageHistory.get(userId);
        const roleData = this.userOriginalRoles.get(userId);

        if (!userHistory && !roleData) {
            return message.reply('❌ No data found for this user.');
        }

        let user;
        try {
            user = await this.client.users.fetch(userId);
        } catch (error) {
            user = { tag: 'Unknown User', id: userId };
        }

        const embed = new EmbedBuilder()
            .setTitle('🐛 Enhanced User Debug Information')
            .setColor('#0099FF')
            .addFields([
                { name: 'User Info', value: `**Tag:** ${user.tag}\n**ID:** ${userId}\n**Mention:** <@${userId}>`, inline: true },
                { name: 'Message History', value: userHistory ? `${userHistory.length} messages` : 'None', inline: true },
                { name: 'Stored Roles', value: roleData ? `${roleData.roles.length} roles` : 'None', inline: true }
            ]);

        if (userHistory && userHistory.length > 0) {
            const recent = userHistory.slice(-5).map(msg => {
                const timeStr = `<t:${Math.floor(msg.timestamp/1000)}:T>`;
                const indicators = [];
                if (msg.attachments > 0) indicators.push(`${msg.attachments} img`);
                if (msg.urlCount > 0) indicators.push(`${msg.urlCount} links`);
                if (msg.suspiciousUrls > 0) indicators.push(`${msg.suspiciousUrls} sus`);
                if (msg.hasEveryone) indicators.push('@everyone');
                
                return `${timeStr} - ${indicators.length > 0 ? indicators.join(', ') : 'text'}`;
            }).join('\n');
            
            embed.addFields([
                { name: 'Recent Activity (Last 5)', value: recent || 'None', inline: false }
            ]);

            // Add summary stats
            const totalImages = userHistory.reduce((sum, msg) => sum + msg.attachments, 0);
            const totalLinks = userHistory.reduce((sum, msg) => sum + msg.urlCount, 0);
            const totalSuspicious = userHistory.reduce((sum, msg) => sum + msg.suspiciousUrls, 0);
            const uniqueChannels = new Set(userHistory.map(msg => msg.channelId)).size;

            embed.addFields([
                { name: 'Activity Summary', value: [
                    `Total Images: ${totalImages}`,
                    `Total Links: ${totalLinks}`,
                    `Suspicious Links: ${totalSuspicious}`,
                    `Unique Channels: ${uniqueChannels}`
                ].join('\n'), inline: true }
            ]);
        }

        if (roleData) {
            embed.addFields([
                { name: 'Stored Role Data', value: [
                    `Stored: <t:${Math.floor(roleData.timestamp/1000)}:R>`,
                    `Reason: ${roleData.reason}`,
                    `User Tag: ${roleData.userTag}`
                ].join('\n'), inline: true }
            ]);
        }

        await message.reply({ embeds: [embed] });
    }

    // Restore user roles manually with enhanced logging
    async restoreUserRoles(message, userId) {
        if (!userId) {
            return message.reply('❌ Please provide a user ID: `!antispam restore <user_id>`');
        }

        const roleData = this.userOriginalRoles.get(userId);
        if (!roleData) {
            return message.reply('❌ No stored role data found for this user.');
        }

        try {
            const member = await message.guild.members.fetch(userId);
            const compromisedRoleId = this.config.antiSpam.compromisedRoleId;

            // Remove compromised role
            if (compromisedRoleId) {
                await member.roles.remove(compromisedRoleId, `Role restoration by ${message.author.tag}`);
            }

            // Restore original roles
            let restoredCount = 0;
            const failedRoles = [];
            for (const roleId of roleData.roles) {
                try {
                    await member.roles.add(roleId, `Role restoration by ${message.author.tag}`);
                    restoredCount++;
                } catch (error) {
                    console.log(`⚠️ Could not restore role ${roleId}:`, error.message);
                    failedRoles.push(roleId);
                }
            }

            // Remove timeout
            await member.timeout(null, `Timeout removed by ${message.author.tag}`);

            // Clear stored data
            this.userOriginalRoles.delete(userId);

            const embed = new EmbedBuilder()
                .setTitle('✅ Roles Restored')
                .setColor('#00FF00')
                .setDescription(`Successfully restored roles for ${member.user.tag} (${member.user})`)
                .addFields([
                    { name: 'User Info', value: `**Tag:** ${member.user.tag}\n**ID:** \`${member.user.id}\`\n**Mention:** ${member.user}`, inline: true },
                    { name: 'Restoration Stats', value: `**Restored:** ${restoredCount}/${roleData.roles.length} roles\n**Failed:** ${failedRoles.length} roles`, inline: true },
                    { name: 'Action By', value: `${message.author.tag}\n${message.author}`, inline: true }
                ])
                .setTimestamp();

            if (failedRoles.length > 0) {
                embed.addFields([
                    { name: '⚠️ Failed Roles', value: failedRoles.map(id => `<@&${id}>`).join(', '), inline: false }
                ]);
            }

            await message.reply({ embeds: [embed] });

            // Log restoration if log channel is set
            if (this.config.antiSpam.logChannelId) {
                try {
                    const logChannel = await this.client.channels.fetch(this.config.antiSpam.logChannelId);
                    const logEmbed = new EmbedBuilder()
                        .setTitle('🔄 Role Restoration')
                        .setColor('#00FF00')
                        .addFields([
                            { name: 'User', value: `${member.user.tag} (${member.user})`, inline: false },
                            { name: 'Restored By', value: `${message.author.tag} (${message.author})`, inline: false },
                            { name: 'Results', value: `${restoredCount}/${roleData.roles.length} roles restored`, inline: false }
                        ])
                        .setTimestamp();
                    
                    await logChannel.send({ embeds: [logEmbed] });
                } catch (logError) {
                    console.error('❌ Error logging restoration:', logError);
                }
            }

        } catch (error) {
            console.error('❌ Error restoring roles:', error);
            await message.reply(`❌ Error restoring roles for <@${userId}>. User may have left the server or roles may not exist.`);
        }
    }

    // Toggle system on/off
    async toggleSystem(message) {
        this.config.antiSpam.enabled = !this.config.antiSpam.enabled;
        
        const embed = new EmbedBuilder()
            .setTitle('🔧 System Toggled')
            .setColor(this.config.antiSpam.enabled ? '#00FF00' : '#FF0000')
            .setDescription(`Enhanced Anti-Spam System is now **${this.config.antiSpam.enabled ? 'ENABLED' : 'DISABLED'}**`)
            .addFields([
                { name: 'Detection Types', value: [
                    '• Multi-channel image spam',
                    '• Suspicious link sharing', 
                    '• Mass @everyone/@here pings',
                    '• Rapid cross-channel posting'
                ].join('\n'), inline: true },
                { name: 'Changed By', value: `${message.author.tag}\n${message.author}`, inline: true }
            ])
            .setTimestamp();

        await message.reply({ embeds: [embed] });

        // Log system toggle
        if (this.config.antiSpam.logChannelId) {
            try {
                const logChannel = await this.client.channels.fetch(this.config.antiSpam.logChannelId);
                const logEmbed = new EmbedBuilder()
                    .setTitle('🔧 Anti-Spam System Toggle')
                    .setColor(this.config.antiSpam.enabled ? '#00FF00' : '#FF0000')
                    .addFields([
                        { name: 'Status', value: this.config.antiSpam.enabled ? '✅ ENABLED' : '❌ DISABLED', inline: true },
                        { name: 'Changed By', value: `${message.author.tag} (${message.author})`, inline: true }
                    ])
                    .setTimestamp();
                
                await logChannel.send({ embeds: [logEmbed] });
            } catch (logError) {
                console.error('❌ Error logging system toggle:', logError);
            }
        }
    }

    // Add method to add trusted domains
    async addTrustedDomain(message, domain) {
        if (!this.config.antiSpam.trustedDomains) {
            this.config.antiSpam.trustedDomains = [];
        }

        if (this.config.antiSpam.trustedDomains.includes(domain.toLowerCase())) {
            return message.reply(`❌ Domain \`${domain}\` is already in the trusted list.`);
        }

        this.config.antiSpam.trustedDomains.push(domain.toLowerCase());
        
        const embed = new EmbedBuilder()
            .setTitle('✅ Trusted Domain Added')
            .setColor('#00FF00')
            .addFields([
                { name: 'Domain', value: `\`${domain}\``, inline: true },
                { name: 'Added By', value: `${message.author.tag}\n${message.author}`, inline: true },
                { name: 'Total Trusted', value: `${this.config.antiSpam.trustedDomains.length} domains`, inline: true }
            ])
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    }

    // Add method to remove trusted domains
    async removeTrustedDomain(message, domain) {
        if (!this.config.antiSpam.trustedDomains) {
            return message.reply('❌ No trusted domains configured.');
        }

        const index = this.config.antiSpam.trustedDomains.indexOf(domain.toLowerCase());
        if (index === -1) {
            return message.reply(`❌ Domain \`${domain}\` is not in the trusted list.`);
        }

        this.config.antiSpam.trustedDomains.splice(index, 1);
        
        const embed = new EmbedBuilder()
            .setTitle('✅ Trusted Domain Removed')
            .setColor('#FF9900')
            .addFields([
                { name: 'Domain', value: `\`${domain}\``, inline: true },
                { name: 'Removed By', value: `${message.author.tag}\n${message.author}`, inline: true },
                { name: 'Remaining', value: `${this.config.antiSpam.trustedDomains.length} domains`, inline: true }
            ])
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    }

    // Method to list trusted domains
    async listTrustedDomains(message) {
        if (!this.config.antiSpam.trustedDomains || this.config.antiSpam.trustedDomains.length === 0) {
            return message.reply('❌ No trusted domains configured.');
        }

        const domainList = this.config.antiSpam.trustedDomains.map((domain, index) => 
            `${index + 1}. \`${domain}\``
        ).join('\n');

        const embed = new EmbedBuilder()
            .setTitle('📋 Trusted Domains List')
            .setColor('#0099FF')
            .setDescription(domainList)
            .addFields([
                { name: 'Total Domains', value: `${this.config.antiSpam.trustedDomains.length}`, inline: true },
                { name: 'Effect', value: 'Links from these domains are not considered suspicious', inline: true }
            ])
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    }
}

module.exports = AntiSpamSystem;