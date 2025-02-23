const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs').promises;

const CMD_PREFIX = '!' // So you only need to change it once to change it everywhere
const CMD_WORD = CMD_PREFIX + 'word';
const CMD_FLUSH = CMD_PREFIX + 'flush';
const CMD_EMOTE = CMD_PREFIX + 'e';
const CMD_COIN = CMD_PREFIX + 'coin';
const CMD_QUIZ = CMD_PREFIX + 'quiz';

//battle command
const CMD_SET = CMD_PREFIX + 'set';
const CMD_END = CMD_PREFIX + 'end';
const CMD_START = CMD_PREFIX + 'start';
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        ],
});
const TYPE_ALL = 'A';
const TYPES = {
    // keyword: channelID
    'S': '1294315883023564841',
    'J': '1294315727272022088',
    'K': '1294315903567138928',
    'C': '1298622202589220904'
};
const ART_KEEP_CHANNEL_IN = '1221936369744740383';
const ART_KEEP_CHANNEL_OUT = '1248975946044805271';
//const about Quiz & battler
const participants = new Map();
let currentRecruitmentCollector = null;
let gamehost = null;
let isEnding = false;
let activeQuiz = null;

const WORDS_PER_REQUEST = 5;
const MAX_MESSAGE_LENGTH = 2000;
const COIN_ODDS = 53; // 25 heads, 25 tails and 1 for each "fun" option :) and 1 "evil" option 👿
const words = {
    unused: {},     
    used: {}       
};

async function loadLists() {
    await Promise.allSettled(Object.keys(TYPES).map(async type => {
        try {
            const parsed_words = await fs.readFile(`./words${type}.json`, 'utf8');
            words.unused[type] = JSON.parse(parsed_words);
            
            try {
                const used = await fs.readFile(`./usedWords${type}.json`, 'utf8');
                words.used[type] = JSON.parse(used);
                words.unused[type] = words.unused[type].filter(word => 
                    !words.used[type].some(uw => uw.word === word.word)
                );
            } catch {
                words.used[type] = [];
            }
        } catch (error) {
            console.error(`File for ${type} is Missing:`, error);
        }
    }));
}

async function saveList(type) {
    try {
        await fs.writeFile(
            `./usedWords${type}.json`,
            JSON.stringify(words.used[type], null, 2)
        );
    } catch (error) {
        console.error('An error occurred while saving:', error);
    }
}

function flushWords(type) {
    words.unused[type].push(...words.used[type]);
    words.used[type] = [];
}

async function sendRandomWords(channel, type) {
    const totalWordsCount = words.unused[type].length + words.used[type].length;
    if (totalWordsCount === 0) {
        channel.send('Word list for this language is empty :C');
        return;
    }
    
    const maxWordsCount = Math.min(WORDS_PER_REQUEST, totalWordsCount);
    const count_unique = Math.min(maxWordsCount, words.unused[type].length);
    const count_repeated = maxWordsCount - count_unique;
    
    let response = '';
    
    for (let r = 0; r < count_repeated; r++) {
        const randomIndex = Math.floor(Math.random() * words.used[type].length);
        const randomWord = words.used[type][randomIndex];
        response += `${randomWord.word}: ${randomWord.meaning}\n`;
    }
    for (let u = 0; u < count_unique; u++) {
        const randomIndex = Math.floor(Math.random() * words.unused[type].length);
        const randomWord = words.unused[type][randomIndex];
        words.unused[type].splice(randomIndex, 1); // change list
        words.used[type].push(randomWord);
        response += `${randomWord.word}: ${randomWord.meaning}\n`;
    }
    
    channel.send(response);
    
    if (words.unused[type].length === 0) {
        flushWords(type);
    }
    if (maxWordsCount <= WORDS_PER_REQUEST) return; // No need to save, the json will always be to a "reset" state
    await saveList(type);
}

async function sendRandomWords_all(channels) {
    await Promise.allSettled(Object.keys(TYPES).map(async type => {
        channels.fetch(TYPES[type])
            .then(channel => sendRandomWords(channel, type))
            .catch(console.error);
    }));
}

async function flush_all() {
    await Promise.allSettled(Object.keys(TYPES).map(async type => {
        flushWords(type);
        await saveList(type);
    }));
}

async function process_args_cmd_emote(channel, emojis, args) {
    if (args.length === 0 || args[0].length === 0) { // Was "args.length === 0" previously
        channel.send('Add the emoji name after the command');
        return;
    }
    
    const emoji_name = args[0].trim();
    let emoji = emojis.find(emoji => emoji.name === emoji_name);
    if (emoji === undefined) {
        channel.send(`${args[0]} is not an emoji from this server`);
        return;
    }
    let emoji_str = "<";
    if (emoji.animated) emoji_str += "a";
    emoji_str += `:${emoji.name}:${emoji.id}> `;
    
    let quantity = 1;
    const max_emojis = Math.floor(MAX_MESSAGE_LENGTH / emoji_str.length);
    if (args.length > 1) {
        quantity = parseInt(args[1]);
        if (isNaN(quantity)) { // This is the correct way to check for NaN. Thanks for telling me sun ^u^
            if (args[1].toLowerCase() == "max") {
                quantity = max_emojis;
            } else {
                channel.send(`${args[1]} is not a number!`);
                return;
            }
        }
        if (quantity < 1) {
            channel.send('Choose a bigger number!');
            return;
        }
        
        if (quantity > max_emojis) {
            channel.send(`Choose a smaller number, the max amount of this emoji i can send is: ${max_emojis}`);
            return;
        }
    }
    
    let message = "";
    for (let i = 0; i < quantity; i++) { message += emoji_str; }
    channel.send(message);
}

function get_coin_message(coin_odd) {
    if (coin_odd > 1 && coin_odd < 52) {
        if (coin_odd % 2 == 0) return "The coin is head!";
        return "The coin is tail!";
    }
    else if(coin_odd <= 1){
        if (coin_odd % 2 == 0) return "What a lucky surprise!! The coin perfectly landed on his side";
        return "Oops!! The coin falled inside a sewer. We will never know what the result was :C";
    }
    return "<:punch:1222037303950839879> IKABOT Rebellion!!!!!" 
}

function generateQuiz(wordList, reverse, channel_arg) {
    // You're already checking for this in the quiz command if, why do it again?
    //if (wordList.length < 4) return { error: "Not enough words to create a quiz." };

    const correctIndex = Math.floor(Math.random() * wordList.length);
    const correctWord = wordList[correctIndex];

    const choices = new Set([correctIndex]);
    while (choices.size < 4) {
        const randomIndex = Math.floor(Math.random() * wordList.length);
        choices.add(randomIndex);
    }

    const shuffledChoices = Array.from(choices).sort(() => Math.random() - 0.5);
    const options = shuffledChoices.map(index => reverse ? wordList[index].meaning : wordList[index].word);

    return {
        channel: channel_arg,
        question: `What is the meaning of "${reverse ? correctWord.word : correctWord.meaning}"?`,
        options,
        correctAnswer: shuffledChoices.indexOf(correctIndex) + 1 // 1-based index
    };
}
//battle quiz!! :punch: :violence:

function startRecruitment(message) {
    gamehost = {
        id: message.author.id,
        username: message.author.username,
        lastChannelId: message.channel.id
    };

    message.channel.send('I want you 🫵!\n pls send join');

    const filter = m => m.content.toLowerCase() === 'join' && m.channel.id === message.channel.id;
    currentRecruitmentCollector = message.channel.createMessageCollector({ filter, time: 15000 });

    currentRecruitmentCollector.on('collect', (m) => {
        if (!participants.has(m.author.id)) {
            participants.set(m.author.id, { username: m.author.username, score: 0 });
            m.reply(`${m.author.username}joined welcome!!`);
        }
    });
    //時間切れになるとこれでhandleEnd
    currentRecruitmentCollector.on('end', () => {
        if (isEnding === false) {
            handleEnd(message);
        }
    });
}
//end command
function endRecruitment(message) {
    isEnding = true;
    handleEnd(message);
}

//募集停止の処理！
function handleEnd(message) {
    if (participants.size > 0) {
        isEnding = true;
        const participantList = Array.from(participants.keys())
            .map(id => `<@${id}>`)
            .join(', ');　//'<@user1>, <@user2>....みたいな'
        currentRecruitmentCollector.stop();
        message.channel.send(`here are participants:\n${participantList}\n<@${gamehost.id}>is host,pls game setting\nlike !set EJ`);
    } else {
        message.channel.send('no participants... yes I know, everyone all exploded TwT');
    }
}
//set command(ほぼCMD_QUIZのパクリｗ)
function handleSetCommand(message, command) {
    let type = command.slice(CMD_SET.length).trim();
    let reverse = false;
    if (type.startsWith('E')) {
        reverse = true;
        type = type.slice(1);
    }
    if (!(type in TYPES)) {
        message.channel.send('Invalid type. Please specify one of: J, S, K, C, EJ, ES, EK, EC.');
        return;
    }
    const wordList = words.unused[type];
    if (wordList.length < 4) {
        message.channel.send('Not enough words to create a quiz for this type.');
        return;
    }
    quizBattle(wordList, reverse, message.channel);
}
//battle!!!(順序の関係で中身を別の関数に移植したらスカスカになった^o^)
async function quizBattle(wordList, reverse, channel) {
    const quiz = generateQuiz(wordList, reverse);
    //ここで中身が定義されるからnullじゃなくなって回答処理で反応するようになるよ
    activeQuiz = { ...quiz, wordList, reverse, answered: false };
     let quizMessage = `${quiz.question}\n`;
            quiz.options.forEach((option, index) => {
                quizMessage += `${index + 1}: ${option}\n`;
            });
    await channel.send(quizMessage);
}
//↑ここまでが終わったらcliantのところに行って回答処理！

//回答処理の関数
async function handleAnswer(message) {
    const userAnswer = parseInt(message.content);
    const currentQuizAnswer = activeQuiz.correctAnswer;
    if (!activeQuiz.answered && userAnswer === currentQuizAnswer) {
        const participant = participants.get(message.author.id);
        participant.score += 1;
        await message.reply(`correct!!${message.author.username} got score!\nyour score ${participant.score}`);
        activeQuiz.answered = true;

        const wordList = activeQuiz.wordList;
        const reverse = activeQuiz.reverse;
        await countdownToNextQuiz(activeQuiz.wordList, activeQuiz.reverse, message.channel);
    } else if (!activeQuiz.answered) {
        await message.reply(`NO!<:punch:1222037303950839879>`);
    }
}

async function countdownToNextQuiz(wordList, reverse, channel) {
    const Max_score = 5;
    const highestScore = Math.max(...Array.from(participants.values()).map(data => data.score));
    if (highestScore >= Max_score) {
        const winner = Array.from(participants.entries()).find(([id, data]) => data.score === highestScore);
        endGame();
        return;
    }
    const countdownMessage = await channel.send("countdown:3second...");

    // 3秒間カウントダウン
    for (let i = 3; i > 0; i--) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1秒待機
        await countdownMessage.edit(`countdown: ${i}second...`);
    }

    // カウントダウン終了後に次のクイズを出題
    await countdownMessage.edit("Let's GO!");
    quizBattle(wordList, reverse, channel);
}

function endGame() {
    if (participants.size > 0) {
        const leaderboard = Array.from(participants.entries())
            .sort(([, a], [, b]) => b.score - a.score)
            .map(([id, data], index) => `#${index + 1}: ${data.username} - score: ${data.score}`)
            .join('\n');

        const winner = Array.from(participants.entries()).reduce((top, entry) => {
            return entry[1].score > top[1].score ? entry : top;
        });

        client.channels.fetch(gamehost.lastChannelId).then(channel => {
            channel.send(`🏆 good game!!\nRanking:\n${leaderboard}\n\n<:IkaWin:1300270175580459018>winner: <@${winner[0]}> (${winner[1].username}) congrats！`);
        });
    } 
    //explodeeeeeeee!!!!!!!!!!!!!!!!!!!!
    participants.clear();
    currentRecruitmentCollector = null;
    gamehost = null;
    isEnding = false;
    activeQuiz = null;
}

async function startupCode() {
    await loadLists();
    
    try {
        const token = process.env.DISCORD_TOKEN;
        if (!token) {
            console.error('環境変数 DISCORD_TOKEN が設定されていません');
            process.exit(-2);
        }
        client.login(token);
    }

    client.on('ready', () => {
        console.log(`Ika-Chan Bot ${client.user.tag}`);
    });
    
    client.on('messageReactionAdd', async (reaction, user) => {
        if (reaction.emoji.name !== '💾') return;
        let content = `__**[Original message by: ${reaction.message.author}]**__ ${reaction.message.content}\n`;
        reaction.message.attachments.forEach((attachment) => {
                if (attachment.spoiler) content += `||${attachment.url}||\n`;
                else content += `${attachment.url}\n`;
        });
        content += `-# 💾 reaction added by: ${user} - Jump to message: ${reaction.message.url}`;
        
        await client.channels.fetch('1248975946044805271')
            .then(channel => channel.send(content))
            .catch(console.error);
    });

    client.on('messageCreate', async message => {
        if (message.author.bot) return;

        const command = message.content;
        // Word Command
        if (command.startsWith(CMD_WORD)) {
            const type = command.slice(CMD_WORD.length).trim();
            if (type === TYPE_ALL) {
                await sendRandomWords_all(client.channels);
                return;
            }
            if (type in TYPES) {
                await sendRandomWords(message.channel, type);
            }
            return;
        }
        // Flush Command
        if (command.startsWith(CMD_FLUSH)) {
            await flush_all();
            return;
        }
        // Emote Command 
        //for CMD_END a bit add lol
        if (command.startsWith(CMD_EMOTE) && message.content !== CMD_END) {
            const args = command.slice(CMD_EMOTE.length + 1).split(" ", 2); // The +1 is for the leading space after the cmd
            await process_args_cmd_emote(message.channel, client.emojis.cache, args); // idk why it doesn't worked for the non-cache version
            return;
        }
        if (command.startsWith(CMD_COIN)) {
            const value = Math.floor(Math.random() * COIN_ODDS); // NOTE: random() will NEVER return 1.0 (But can return 0.0)
            const response = get_coin_message(value);
            message.channel.send(response);
            return;
        }
        
        // Quiz Command
        if (command.startsWith(CMD_QUIZ)) {
            if (activeQuiz) {
                message.channel.send('A quiz is already in progress. Please answer the current quiz first.');
                return;
            }

            let type = command.slice(CMD_QUIZ.length).trim();
            let reverse = false;
            if (type.startsWith('E')) {
                reverse = true;
                type = type.slice(1);
            }
            if (!(type in TYPES)) {
                message.channel.send('Invalid type. Please specify one of: J, S, K, C, EJ, ES, EK, EC.');
                return;
            }

            const wordList = words.unused[type];
            if (wordList.length < 4) {
                message.channel.send('Not enough words to create a quiz for this type.');
                return;
            }

            const quiz = generateQuiz(wordList, reverse, message.channel);
            if (quiz.error) {
                message.channel.send(quiz.error);
                return;
            }

            activeQuiz = quiz;

            let quizMessage = `${quiz.question}\n`;
            quiz.options.forEach((option, index) => {
                quizMessage += `${index + 1}: ${option}\n`;
            });

            message.channel.send(quizMessage);
            return;
        }
        if (activeQuiz && message.channel === activeQuiz.channel) {
            const answer = parseInt(command, 10);

            if (isNaN(answer) || answer < 1 || answer > 4) {
                message.channel.send('Please answer with a number between 1 and 4.');
                return;
            }

            if (answer === activeQuiz.correctAnswer) {
                message.channel.send('Correct! :tada:');
            } else {
                message.channel.send(`Incorrect. The correct answer was ${activeQuiz.correctAnswer}: ${activeQuiz.options[activeQuiz.correctAnswer - 1]}.`);
            }

            activeQuiz = null; 
        }

            // !start command
        if (command.startsWith(CMD_START)) {
            if (currentRecruitmentCollector) {
            return message.reply('hurry up!!!Applications are already open!');
        }
            if (activeQuiz) {
                return message.reply('sorry u cant start quiz now');
            }
            startRecruitment(message);
            return;
        }

           // !end cmd
        if (command.startsWith(CMD_END) && isEnding === false) {
            if (!gamehost) {
                return message.reply('no host now, how to end game lol');
            }
            if(message.channel.id !== gamehost.lastChannelId){
                return message.reply('u cant use this channel');
            }
            if (!currentRecruitmentCollector) {
                return message.reply('no recruitment');
            }
            if (!participants.has(message.author.id)) {
                return message.reply('u cant end this recruitment if u want u should join!');
            }
            endRecruitment(message);
            return;
        }
            // !set コマンド
        if (command.startsWith(CMD_SET)) {
            if (!gamehost) {
                return message.reply('no host');
            }
            if(message.channel.id !== gamehost.lastChannelId){
                return message.reply('u cant use this channel');
            }
            if (message.author.id !== gamehost.id) {
                return message.reply('ur not host!');
            }
            if (isEnding === false) {
                return message.reply('still recruitment is opening');
            }
            handleSetCommand(message, command);
            return;
        }
            // クイズ回答処理
    if (activeQuiz && /^[1-4]$/.test(message.content)) {
        if (!participants.has(message.author.id)) {
            return; // 未参加者は無視
        }
        if(message.channel.id !== gamehost.lastChannelId){
            return message.reply('why u answered this channnel!?');
        }

        handleAnswer(message);
    }



    });

    process.on('SIGINT', async () => {
        console.log('End');
        await Promise.allSettled(Object.keys(TYPES).map(type => saveList(type)));
        process.exit(0);
    });
}

// Auto-Executed On Startup
startupCode();
