import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import { config } from 'dotenv';
import cron from 'node-cron';
import fetch from 'node-fetch';
import Canvas from 'canvas';

config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// Fungsi buat gambar welcome/leave
async function createWelcomeLeaveImage(username, avatarURL, text) {
  // buat canvas ukuran 700x250 px
  const canvas = Canvas.createCanvas(700, 250);
  const ctx = canvas.getContext('2d');

  // Background warna
  ctx.fillStyle = '#23272A';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Border
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, canvas.width, canvas.height);

  // Load avatar user
  const avatar = await Canvas.loadImage(avatarURL);

  // Gambar lingkaran avatar
  const avatarX = 50;
  const avatarY = 25;
  const avatarSize = 200;
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize/2, avatarY + avatarSize/2, avatarSize/2, 0, Math.PI * 2, true);
  ctx.closePath();
  ctx.clip();

  ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);

  ctx.restore();

  // Tulisan welcome/leave
  ctx.fillStyle = '#ffffff';
  ctx.font = '36px Sans-serif';
  ctx.fillText(text, 270, 90);

  ctx.font = '28px Sans-serif';
  ctx.fillText(username, 270, 150);

  return canvas.toBuffer();
}

client.on('guildMemberAdd', async (member) => {
  const channel = member.guild.channels.cache.get(process.env.WELCOME_CHANNEL_ID);
  if (!channel?.isTextBased()) return;

  try {
    const buffer = await createWelcomeLeaveImage(member.user.username, member.user.displayAvatarURL({ extension: 'png' }), 'Selamat Datang!');
    const attachment = { attachment: buffer, name: 'welcome-image.png' };

    const embed = new EmbedBuilder()
      .setTitle('👋 Selamat Datang!')
      .setDescription(`Hai ${member.user.username}, selamat datang di server ACE's!`)
      .setColor('#00AE86')
      .setImage('attachment://welcome-image.png');

    await channel.send({ embeds: [embed], files: [attachment] });
  } catch (error) {
    console.error('Error welcome:', error);
  }
});

client.on('guildMemberRemove', async (member) => {
  const channel = member.guild.channels.cache.get(process.env.LEAVE_CHANNEL_ID);
  if (!channel?.isTextBased()) return;

  try {
    const buffer = await createWelcomeLeaveImage(member.user.username, member.user.displayAvatarURL({ extension: 'png' }), 'Sayonara! Sampai Jumpa!');
    const attachment = { attachment: buffer, name: 'leave-image.png' };

    const embed = new EmbedBuilder()
      .setTitle('👋 Sampai Jumpa!')
      .setDescription(`${member.user.username} telah meninggalkan server.`)
      .setColor('#FF0000')
      .setImage('attachment://leave-image.png');

    await channel.send({ embeds: [embed], files: [attachment] });
  } catch (error) {
    console.error('Error leave:', error);
  }
});


// Cron job: kirim anime alert setiap hari jam 7 pagi
cron.schedule('0 7 * * *', async () => {
  const channelId = process.env.ANIME_ALERT_CHANNEL_ID;
  const channel = client.channels.cache.get(channelId);
  if (!channel?.isTextBased()) return;

  try {
    const today = new Date().getDay(); // 0 = Sunday
    const airingSchedule = await getDailyAnime(today);

    if (!airingSchedule.length) {
      await channel.send('📭 Tidak ada anime tayang hari ini.');
      return;
    }

    for (const anime of airingSchedule) {
      const embed = new EmbedBuilder()
        .setTitle(anime.title)
        .setDescription(`🕒 Episode ${anime.episode} - Tayang pukul ${anime.timeUntilAiring}`)
        .setImage(anime.coverImage)
        .setColor(0x1ABC9C)
        .setTimestamp();

      await channel.send({ embeds: [embed] });
    }

  } catch (err) {
    console.error('Gagal fetch anime harian:', err);
  }
});


async function getDailyAnime(weekday) {
  const query = `
    query ($now: Int) {
      Page(perPage: 10) {
        airingSchedules(
          airingAt_greater: $now,
          sort: TIME
        ) {
          episode
          airingAt
          media {
            title {
              romaji
            }
            coverImage {
              large
            }
          }
        }
      }
    }
  `;

  const variables = {
    now: Math.floor(Date.now() / 1000),
  };

  const url = 'https://graphql.anilist.co';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  const { data } = await response.json();

  // Filter berdasarkan hari
  const result = data.Page.airingSchedules
    .filter(schedule => new Date(schedule.airingAt * 1000).getDay() === weekday)
    .map(schedule => ({
      title: schedule.media.title.romaji,
      episode: schedule.episode,
      timeUntilAiring: new Date(schedule.airingAt * 1000).toLocaleTimeString(),
      coverImage: schedule.media.coverImage.large,
    }));

  return result;
}

client.login(process.env.DISCORD_TOKEN);
