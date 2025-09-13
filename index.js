
const { Client, Collection, Events, GatewayIntentBits, EmbedBuilder, PermissionsBitField, ActivityType, PresenceUpdateStatus,Partials  } = require('discord.js');

require("dotenv").config();

const token = process.env.TOKEN;
const fs = require('node:fs');
const path = require('node:path');
const fetch = require('node-fetch');

const config = require('./config.json');
const AntiSpamSystem = require('./commands/antispam');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildPresences, // Added for offline detection
        GatewayIntentBits.GuildVoiceStates, // Added for voice support system
        GatewayIntentBits.GuildMessageReactions // Add this for reactions
    ],
    partials: [
        Partials.Message, // Allows reactions on uncached messages
        Partials.Channel, // Allows reactions in uncached channels  
        Partials.Reaction, // Allows partial reaction data
        Partials.User, // Allows partial user data
        Partials.GuildMember // Allows partial member data
    ],
});


client.commands = new Map();


const voiceSupport = new VoiceSupportSystem(client, config);
const antiSpam = new AntiSpamSystem(client, config);

let currentStatusIndex = 0;


const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        client.commands.set(command.name, command);
        console.log(`Loaded command: ${command.name}`);
    }
}

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const prefix = config.prefix;

    if (message.mentions.has(client.user) && !message.mentions.everyone) {
        const mentionCommand = client.commands.get('mention');
        if (mentionCommand) {
            return mentionCommand.execute(message, [], client, config);
        }
    }


 if (message.content.startsWith(prefix + 'antispam')) {
        const args = message.content.slice(prefix.length).trim().split(/ +/);
        args.shift(); 
        await antiSpam.handleAntiSpamCommand(message, args);
        return;
    }

 if (!message.content.startsWith(prefix)) return;
    
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    const command = client.commands.get(commandName);
    if (!command) return;

    try {
        await command.execute(message, args, client, config);
    } catch (error) {
        console.error(`Error executing command ${commandName}:`, error);

        const errorEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Error')
            .setDescription('There was an error executing this command!')
            .setTimestamp();

        await message.reply({ embeds: [errorEmbed] });
    }
});

const ErrorHandler = require('./errorHandler');
new ErrorHandler(client);


client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    console.log('Bot is ready!');
    

    antiSpam.initialize();
    console.log('🛡️ Anti-Spam System ready!');


    function getGuild() {
        return client.guilds.cache.first();
    }


    const statusMessages = [
        { 
            name: '', 
            type: ActivityType.Watching,
            status: 'online'
        }, 
        { 
            name: 'Spadikam V3 | System Online', 
            type: ActivityType.Playing,
            status: 'online'
        },
        { 
            name: 'DATABASE_URL | Connecting...', 
            type: ActivityType.Listening,
            status: 'dnd'
        },
        { 
            name: `CPU Load: ${Math.floor(Math.random() * (42 - 5) + 5)}% | Memory: ${(Math.random() * (95 - 10) + 10).toFixed(1)}MB`, 
            type: ActivityType.Watching,
            status: 'online'
        },
        { 
            name: 'Updating...', 
            type: ActivityType.Watching,
            status: 'dnd'  
        },
        { 
            name: 'Spadikam Server', 
            type: ActivityType.Competing,
            status: 'online'
        }, 
        { 
            name: '[AUTO]:Checking Database...', 
            type: ActivityType.Watching,
            status: 'dnd'
        }, 
        { 
            name: '[AUTO]:to Error...', 
            type: ActivityType.Listening,
            status: 'dnd'
        }, 
        { 
            name: '[AUTO]:Collecting Error...', 
            type: ActivityType.Listening,
            status: 'dnd'
        }, 
        { 
            name: '[AUTO]:Checking Repair', 
            type: ActivityType.Listening,
            status: 'dnd'
        }, 
        { 
            name: '[AUTO]:Successfully Checked', 
            type: ActivityType.Listening,
            status: 'dnd'
        }, 
        { 
            name: '[AUTO]:Restarting...', 
            type: ActivityType.Listening,
            status: 'dnd'
        }, 
        { 
            name: 'Load Balancer | Optimizing...', 
            type: ActivityType.Competing,
            status: 'dnd'
        },
        { 
            name: 'CDN Cache | Purging...', 
            type: ActivityType.Listening,
            status: 'dnd'
        },
        { 
            name: 'Log Rotation | Cleaning...', 
            type: ActivityType.Listening,
            status: 'idle'
        },
        { 
            name: 'API Endpoints | Testing...', 
            type: ActivityType.Watching,
            status: 'dnd'
        },
    ];

    setInterval(() => {
        const guild = getGuild();
        if (!guild) return; 

    
        statusMessages[0].name = `${guild.memberCount} users`;
        
      
        const memoryUsage = (Math.random() * (95 - 10) + 10).toFixed(1);
        const cpuLoad = Math.floor(Math.random() * (42 - 5) + 5);
        statusMessages[3].name = `CPU Load: ${cpuLoad}% | Memory: ${memoryUsage}MB`;

     
        const status = statusMessages[currentStatusIndex];

   
        client.user.setPresence({
            activities: [{
                name: status.name,
                type: status.type
            }],
            status: status.status
        });


      
        currentStatusIndex = (currentStatusIndex + 1) % statusMessages.length;
    }, 20000);



client.on('error', console.error);

client.login(token)
});



