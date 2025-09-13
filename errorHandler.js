// errorHandler.js - Enhanced error handler for your bot
const axios = require('axios');
const fs = require('fs');

class ErrorHandler {
    constructor(client) {
        this.client = client;
        this.config = this.loadConfig();
        this.errorCount = 0;
        this.setupErrorHandlers();
        console.log('🛡️  Error handler initialized');
    }
    
    loadConfig() {
        try {
            return JSON.parse(fs.readFileSync('./config.json', 'utf8'));
        } catch (error) {
            console.error('Failed to load config.json for error handler:', error);
            return {};
        }
    }
    
    async sendErrorNotification(error, context = '', severity = 'medium') {
        try {
            this.errorCount++;
            
            const colors = {
                low: 0xFFD700,      // Gold
                medium: 0xFF6B6B,   // Red
                high: 0x800000,     // Dark Red
                critical: 0x000000  // Black
            };
            
            const severityEmojis = {
                low: '⚠️',
                medium: '🚨',
                high: '🆘',
                critical: '💀'
            };
            
            const embed = {
                title: `${severityEmojis[severity]} Spadikam Bot Error - ${severity.toUpperCase()}`,
                description: `\`\`\`js\n${error.stack?.slice(0, 1400) || error.message}\n\`\`\``,
                color: colors[severity],
                timestamp: new Date().toISOString(),
                footer: {
                    text: `Error #${this.errorCount} | Spadikam Error Handler`
                },
                fields: [
                    {
                        name: '📍 Context',
                        value: context || 'Unknown',
                        inline: true
                    },
                    {
                        name: '🤖 Bot Status',
                        value: this.client.isReady() ? '🟢 Online' : '🔴 Offline',
                        inline: true
                    },
                    {
                        name: '📊 Guild Count',
                        value: this.client.guilds.cache.size.toString(),
                        inline: true
                    }
                ]
            };
            
            // Add additional info for high/critical errors
            if (severity === 'high' || severity === 'critical') {
                embed.fields.push({
                    name: '🔧 Recommended Action',
                    value: severity === 'critical' ? 
                        '**IMMEDIATE ATTENTION REQUIRED**\nBot may be unstable' : 
                        'Monitor bot closely for issues',
                    inline: false
                });
            }
            
            let content = '';
            if (this.config.monitor?.pingUserId) {
                content += `<@${this.config.monitor.pingUserId}> `;
            }
            if (this.config.monitor?.pingRoleId) {
                content += `<@&${this.config.monitor.pingRoleId}>`;
            }
            
            const payload = {
                content: content.trim(),
                embeds: [embed]
            };
            
            if (this.config.monitor?.webhookUrl) {
                await axios.post(this.config.monitor.webhookUrl, payload);
                console.log(`✅ Error notification sent (${severity}): ${context}`);
            }
        } catch (err) {
            console.error('❌ Failed to send error notification:', err);
        }
    }
    
    setupErrorHandlers() {
        // Handle unhandled promise rejections
        process.on('unhandledRejection', (reason, promise) => {
            console.error('🚨 Unhandled Promise Rejection:', reason);
            this.sendErrorNotification(reason, 'Unhandled Promise Rejection', 'high');
        });
        
        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            console.error('💀 Uncaught Exception:', error);
            this.sendErrorNotification(error, 'Uncaught Exception', 'critical');
        });
        
        // Handle Discord.js client errors
        this.client.on('error', (error) => {
            console.error('🔴 Discord Client Error:', error);
            this.sendErrorNotification(error, 'Discord Client Error', 'high');
        });
        
        // Handle Discord.js warnings
        this.client.on('warn', (warning) => {
            console.warn('⚠️  Discord Client Warning:', warning);
            // Only send notifications for important warnings
            if (warning.includes('rate limit') || warning.includes('timeout')) {
                this.sendErrorNotification(new Error(warning), 'Discord Client Warning', 'low');
            }
        });
        
        // Handle Discord.js debug (optional - usually too verbose)
        // this.client.on('debug', (info) => {
        //     console.log('🔍 Discord Debug:', info);
        // });
    }
}

module.exports = ErrorHandler;