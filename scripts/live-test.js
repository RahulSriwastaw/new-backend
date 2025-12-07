import https from 'https'

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      const chunks = []
      res.on('data', (d) => chunks.push(d))
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8')
        resolve({ status: res.statusCode, body })
      })
    })
    req.on('error', reject)
  })
}

async function run() {
  const base = 'https://new-backend-production-c886.up.railway.app'
  const results = {}
  results.health = await get(`${base}/health`)
  results.api = await get(`${base}/api`)
  results.templates = await get(`${base}/api/v1/templates`)
  console.log(JSON.stringify(results, null, 2))
}

run().catch((e) => {
  console.error('live-test-error', e.message)
  process.exit(1)
})
