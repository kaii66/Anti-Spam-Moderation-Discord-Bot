// monitor.js - Main monitoring system for your bot
const { spawn } = require('child_process');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

class BotMonitor {
    constructor() {
        this.config = this.loadConfig();
        this.botProcess = null;
        this.restartCount = 0;
        this.maxRestarts = this.config.monitor?.maxRestarts || 5;
        this.restartDelay = this.config.monitor?.restartDelay || 5000;
        this.isShuttingDown = false;
        this.lastHeartbeat = Date.now();
        
        console.log('🔧 Bot Monitor System Starting...');
        this.setupSignalHandlers();
        this.startBot();
        this.startHeartbeatCheck();
    }
    
    loadConfig() {
        try {
            const configPath = path.join(__dirname, 'config.json');
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            
            // Validate monitor configuration
            if (!config.monitor) {
                console.warn('⚠️  No monitor configuration found in config.json');
                config.monitor = {};
            }
            
            if (!config.monitor.webhookUrl) {
                console.warn('⚠️  No webhook URL configured for notifications');
            }
            
            return config;
        } catch (error) {
            console.error('❌ Failed to load config.json:', error);
            process.exit(1);
        }
    }
    
    async sendDiscordNotification(title, description, color = 0xFF0000, fields = []) {
        if (!this.config.monitor?.webhookUrl) {
            console.log(`📢 Notification (no webhook): ${title} - ${description}`);
            return;
        }
        
        try {
            const embed = {
                title,
                description,
                color,
                timestamp: new Date().toISOString(),
                footer: {
                    text: 'Spadikam Bot Monitor'
                },
                fields
            };
            
            let content = '';
            if (this.config.monitor.pingUserId) {
                content += `<@${this.config.monitor.pingUserId}> `;
            }
            if (this.config.monitor.pingRoleId) {
                content += `<@&${this.config.monitor.pingRoleId}>`;
            }
            
            const payload = {
                content: content.trim(),
                embeds: [embed]
            };
            
            await axios.post(this.config.monitor.webhookUrl, payload);
            console.log(`✅ Discord notification sent: ${title}`);
        } catch (error) {
            console.error('❌ Failed to send Discord notification:', error.message);
        }
    }
    
    startBot() {
        if (this.isShuttingDown) return;
        
        console.log('🚀 Starting Spadikam bot...');
        
        this.botProcess = spawn('node', ['index.js'], {
            stdio: ['inherit', 'pipe', 'pipe'],
            cwd: __dirname,
            env: { ...process.env, NODE_ENV: 'production' }
        });
        
        this.botProcess.stdout.on('data', (data) => {
            const output = data.toString();
            console.log(`[BOT] ${output}`);
            
            // Update heartbeat when bot shows activity
            this.lastHeartbeat = Date.now();
            
            // Check for specific bot ready messages
            if (output.includes('Bot is ready!') || output.includes('Logged in as')) {
                this.sendDiscordNotification(
                    '✅ Spadikam Bot Online',
                    'Bot has successfully started and is ready!',
                    0x00FF00,
                    [
                        {
                            name: 'Process ID',
                            value: this.botProcess.pid.toString(),
                            inline: true
                        },
                        {
                            name: 'Restart Count',
                            value: this.restartCount.toString(),
                            inline: true
                        },
                        {
                            name: 'Uptime',
                            value: '0 seconds',
                            inline: true
                        }
                    ]
                );
            }
        });
        



        this.botProcess.stderr.on('data', (data) => {
            const errorOutput = data.toString();
            console.error(`[BOT ERROR] ${errorOutput}`);
            
            // Send error notification for significant errors
            if (errorOutput.includes('Error') || errorOutput.includes('Exception')) {
                this.sendDiscordNotification(
                    '⚠️ Bot Error Detected',
                    `\`\`\`\n${errorOutput.slice(0, 1500)}\n\`\`\``,
                    0xFFA500,
                    [
                        {
                            name: 'Process Status',
                            value: this.botProcess.killed ? 'Killed' : 'Running',
                            inline: true
                        },
                        {
                            name: 'Restart Count',
                            value: this.restartCount.toString(),
                            inline: true
                        }
                    ]
                );
            }
        });
        
        this.botProcess.on('exit', (code, signal) => {
            if (this.isShuttingDown) return;
            
            console.log(`🔴 Bot process exited with code ${code}, signal ${signal}`);
            
            const exitReason = this.getExitReason(code, signal);
            
            this.sendDiscordNotification(
                '🔴 Spadikam Bot Crashed',
                `Bot process has exited unexpectedly.\n**Reason:** ${exitReason}`,
                0xFF0000,
                [
                    {
                        name: 'Exit Code',
                        value: code?.toString() || 'Unknown',
                        inline: true
                    },
                    {
                        name: 'Signal',
                        value: signal || 'None',
                        inline: true
                    },
                    {
                        name: 'Restart Attempt',
                        value: `${this.restartCount + 1}/${this.maxRestarts}`,
                        inline: true
                    }
                ]
            );
            
            this.handleBotCrash();
        });
        
        this.botProcess.on('error', (error) => {
            console.error('🚨 Failed to start bot process:', error);
            this.sendDiscordNotification(
                '🚨 Bot Process Error',
                `Failed to start bot process: ${error.message}`,
                0x800000
            );
        });
        
        // Reset restart count on successful start
        if (this.restartCount > 0) {
            setTimeout(() => {
                if (this.botProcess && !this.botProcess.killed) {
                    this.restartCount = 0;
                    console.log('✅ Bot stable - reset restart counter');
                }
            }, 60000); // Reset after 1 minute of stable running
        }
    }
    
    getExitReason(code, signal) {
        if (signal === 'SIGTERM') return 'Terminated by system';
        if (signal === 'SIGKILL') return 'Force killed';
        if (signal === 'SIGINT') return 'Interrupted (Ctrl+C)';
        if (code === 0) return 'Normal exit';
        if (code === 1) return 'General error';
        if (code === 130) return 'Interrupted by user';
        return `Unknown (code: ${code}, signal: ${signal})`;
    }
    
    handleBotCrash() {
        if (this.isShuttingDown) return;
        
        this.restartCount++;
        
        if (this.restartCount >= this.maxRestarts) {
            this.sendDiscordNotification(
                '🚨 Bot Monitor Critical Alert',
                `**URGENT:** Bot has crashed ${this.restartCount} times and reached the maximum restart limit.\n\n**Manual intervention required immediately!**\n\n**Possible issues:**\n• Token expired\n• API rate limits\n• Code errors\n• Server issues`,
                0x800000,
                [
                    {
                        name: '🔧 Next Steps',
                        value: '1. Check logs\n2. Verify token\n3. Check Discord status\n4. Restart manually',
                        inline: false
                    }
                ]
            );
            console.log('❌ Max restart attempts reached. Stopping monitor.');
            process.exit(1);
        }
        
        console.log(`⏳ Restarting bot in ${this.restartDelay / 1000} seconds... (Attempt ${this.restartCount}/${this.maxRestarts})`);
        
        setTimeout(() => {
            this.startBot();
        }, this.restartDelay);
    }
    
    startHeartbeatCheck() {
        // Check if bot is responsive every 2 minutes
        setInterval(() => {
            if (this.isShuttingDown) return;
            
            const timeSinceLastHeartbeat = Date.now() - this.lastHeartbeat;
            const maxSilenceTime = 300000; // 5 minutes
            
            if (timeSinceLastHeartbeat > maxSilenceTime && this.botProcess && !this.botProcess.killed) {
                console.log('⚠️  Bot appears unresponsive - forcing restart...');
                this.sendDiscordNotification(
                    '⚠️ Bot Unresponsive',
                    'Bot has been silent for over 5 minutes. Forcing restart...',
                    0xFFA500
                );
                
                this.botProcess.kill('SIGTERM');
                setTimeout(() => {
                    if (this.botProcess && !this.botProcess.killed) {
                        this.botProcess.kill('SIGKILL');
                    }
                }, 5000);
            }
        }, 120000); // Check every 2 minutes
    }
    
    setupSignalHandlers() {
        process.on('SIGINT', () => this.shutdown('SIGINT'));
        process.on('SIGTERM', () => this.shutdown('SIGTERM'));
        
        process.on('uncaughtException', (error) => {
            console.error('🚨 Uncaught Exception in monitor:', error);
            this.sendDiscordNotification(
                '🚨 Monitor System Critical Error',
                `Monitor system encountered a critical error:\n\`\`\`\n${error.stack?.slice(0, 1000) || error.message}\n\`\`\``,
                0x800000
            );
            process.exit(1);
        });
        
        process.on('unhandledRejection', (reason, promise) => {
            console.error('🚨 Unhandled Promise Rejection in monitor:', reason);
            this.sendDiscordNotification(
                '⚠️ Monitor System Warning',
                `Unhandled promise rejection:\n\`\`\`\n${reason}\n\`\`\``,
                0xFFA500
            );
        });
    }
    
    shutdown(signal) {
        if (this.isShuttingDown) return;
        
        this.isShuttingDown = true;
        console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
        
        this.sendDiscordNotification(
            '🛑 Spadikam Bot Monitor Shutdown',
            `Monitor system is shutting down gracefully (${signal})`,
            0x808080,
            [
                {
                    name: 'Total Restarts',
                    value: this.restartCount.toString(),
                    inline: true
                },
                {
                    name: 'Uptime',
                    value: this.getUptime(),
                    inline: true
                }
            ]
        );
        
        if (this.botProcess) {
            console.log('🔄 Terminating bot process...');
            this.botProcess.kill('SIGTERM');
            setTimeout(() => {
                if (this.botProcess && !this.botProcess.killed) {
                    console.log('⚡ Force killing bot process...');
                    this.botProcess.kill('SIGKILL');
                }
                process.exit(0);
            }, 10000);
        } else {
            process.exit(0);
        }
    }
    
    getUptime() {
        const uptime = process.uptime();
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);
        return `${hours}h ${minutes}m ${seconds}s`;
    }
}

// Start the monitor
console.log('🎯 Spadikam Bot Monitor v1.0');
console.log('==========================================');
new BotMonitor();