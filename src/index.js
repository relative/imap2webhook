const { getMailboxes, createEmbed } = require('./util'),
  { ImapFlow } = require('imapflow'),
  mailparser = require('mailparser'),
  FormData = require('form-data'),
  dotenv = require('dotenv'),
  https = require('https')

dotenv.config()

const client = new ImapFlow({
    host: process.env.IMAP_HOST,
    port: parseInt(process.env.IMAP_PORT || '993', 10),
    secure: (process.env.IMAP_SECURE || '1') === '1',
    logger: false,
    auth: {
      user: process.env.IMAP_USER,
      pass: process.env.IMAP_PASS,
    },
  }),
  mailboxes = getMailboxes()

function postMessages(mailbox, messages) {
  const embeds = messages.map(({ msg, mp }) => createEmbed(mailbox, msg, mp))
  const fd = new FormData()
  fd.append(
    'payload_json',
    JSON.stringify({
      embeds,
    }),
    {
      contentType: 'application/json',
    }
  )
  for (let i = 0; i < messages.length; ++i) {
    const { msg } = messages[i]
    fd.append(`files[${i}]`, msg.source, {
      filename: msg.emailId + '.eml',
      contentType: 'application/octet-stream',
      knownLength: msg.source.byteLength,
    })
  }

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        method: 'POST',
        hostname: 'discord.com',
        port: 443,
        path: `/api/webhooks/${mailbox.webhook.id}/${mailbox.webhook.token}`,
        headers: {
          'User-Agent': 'imap2webhook',
          ...fd.getHeaders(),
        },
      },
      (res) => {
        const chunks = []
        res
          .on('error', reject)
          .on('data', (chunk) => chunks.push(chunk))
          .on('end', () => {
            const data = Buffer.concat(chunks).toString()
            const json = JSON.parse(data)
            if (res.statusCode === 200) return resolve()
            return reject(json)
          })
      }
    )
    req.on('error', reject)
    fd.pipe(req)
  })
}

// only sends (chunkSize) messages at a time to webhook
const chunkSize = 3

async function monitor() {
  for (const mailbox of mailboxes) {
    console.log('Checking', mailbox.path)
    const lock = await client.getMailboxLock(mailbox.path)

    try {
      const unseenSeqs = await client.search({ seen: false }),
        _msgsGenerator = client.fetch(unseenSeqs, {
          source: true,
          flags: true,
        }),
        msgs = []

      for await (const msg of _msgsGenerator) {
        // _msgsGenerator is AsyncGenerator
        const mp = await mailparser.simpleParser(msg.source)
        mp.emailId = msg.emailId
        mp.source = msg.source
        console.log('Parsed message', msg.emailId)
        client.messageFlagsAdd(msg.seq, ['\\Seen'])
        msgs.push({ msg, mp })
      }

      for (let i = 0; i < msgs.length; i += chunkSize) {
        await postMessages(mailbox, msgs.slice(i, i + chunkSize))
      }
    } catch (ex) {
      console.error('Failed to parse messages', ex)
    } finally {
      lock.release()
    }
  }
}

async function main() {
  await client.connect()

  await monitor()

  // 180000ms = 3 minutes, 3 * 60 * 1000
  const interval = parseInt(process.env.CHECK_INTERVAL || '180000', 10)

  if (interval < 1000) {
    throw new Error('CHECK_INTERVAL is less than 1000ms (1sec)')
  }

  setInterval(() => {
    monitor()
      .then(() => console.log('Complete'))
      .catch((err) => {
        console.error(err)
        process.exit(1)
      })
  }, interval)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
