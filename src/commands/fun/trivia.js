const Command = require('../Command.js');
const {
    MessageEmbed,
    MessageActionRow,
    MessageSelectMenu,
} = require('discord.js');
const fs = require('fs');
const YAML = require('yaml');
const {oneLine} = require('common-tags');
const emojis = require('../../utils/emojis.json');

const reward = 10;
const timeout = 30000;

module.exports = class TriviaCommand extends Command {
    constructor(client) {
        super(client, {
            name: 'trivia',
            aliases: ['triv', 't'],
            usage: 'trivia',
            description: oneLine`
        Compete against your friends in a game of trivia (anyone can answer).
        Correct answer rewards ${reward} points.
        The question will expire after ${timeout / 1000} seconds.
      `,
            type: client.types.FUN,
            examples: ['trivia sports']
        });
    }

    run(message) {
        if (!this.client.topics?.trivia?.length) return message.channel.send('There are no trivia questions available.');

        const row = new MessageActionRow().addComponents(
            new MessageSelectMenu()
                .setCustomId('trivia-topic')
                .setPlaceholder('Select a topic')
                .addOptions(this.client.topics.trivia.map(topic => {
                    return {
                        label: this.client.utils.capitalize(topic.replace('-', ' ')),
                        // description: topic,
                        value: topic
                    };
                }))
        );

        message.reply({
            components: [row]
        }).then(msg => {
            const filter = (option) => {
                option.deferUpdate();
                return option.user.id === message.author.id;
            };

            const selectCollector = msg.createMessageComponentCollector({
                filter,
                componentType: 'SELECT_MENU',
                maxUsers: 1
            });

            selectCollector.on('collect', (component) => {
                const topic = component.values[0];
                if (!topic) return;
                msg.delete();

                // Get question and answers
                const path = __basedir + '/data/trivia/' + topic + '.yaml';
                const questions = YAML.parse(fs.readFileSync(path, 'utf-8'));
                // get random question
                const n = Math.floor(Math.random() * Object.keys(questions).length);
                const question = Object.keys(questions)[n];
                const answers = questions[question];
                const origAnswers = [...answers].map(a => `\`${a}\``);

                // Clean answers
                for (let i = 0; i < answers.length; i++) {
                    answers[i] = answers[i].trim().toLowerCase().replace(/\.|'|-|\s/g, '');
                }

                // Get user answer
                const questionEmbed = new MessageEmbed()
                    .setTitle('Trivia')
                    .addField('Topic', `\`${this.client.utils.capitalize(topic.replace('-', ' '))}\``)
                    .addField('Question', `${question}`)
                    .setFooter({
                        text: `Expires in ${timeout / 1000} seconds`,
                        iconURL: message.author.displayAvatarURL()
                    })
                    .setTimestamp()
                    .setColor(message.guild.me.displayHexColor);

                const url = question.match(/\bhttps?:\/\/\S+/gi);
                if (url) questionEmbed.setImage(url[0]);

                message.channel.send({
                    embeds: [questionEmbed]
                });

                let winner;

                const collector = msg.channel.createMessageCollector({
                    filter: (m) => !m.author.bot,
                    time: timeout
                }); // Wait 30 seconds

                collector.on('collect', msg => {
                    if (answers.includes(msg.content.trim().toLowerCase().replace(/\.|'|-|\s/g, ''))) {
                        winner = msg.author;
                        collector.stop();
                    }
                });

                collector.on('end', () => {
                    const answerEmbed = new MessageEmbed()
                        .setTitle('Trivia')
                        .setFooter({
                            text: message.member.displayName,
                            iconURL: message.author.displayAvatarURL()
                        })
                        .setTimestamp()
                        .setColor(message.guild.me.displayHexColor);
                    if (winner) {
                        message.client.db.users.updatePoints.run(
                            {points: reward},
                            winner.id,
                            message.guild.id
                        );
                        message.channel.send({
                            embeds: [answerEmbed.setDescription(`Congratulations ${winner}, you gave the correct answer! **+${reward} Points!** ${emojis.points}`)]
                        });
                    }
                    else message.channel.send({
                        embeds: [
                            answerEmbed
                                .setDescription('Sorry, time\'s up! Better luck next time.')
                                .addField('Correct Answers', origAnswers.join('\n'))
                        ]
                    });
                });
            });

        });
    }
};