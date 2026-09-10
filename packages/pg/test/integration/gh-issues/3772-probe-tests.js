'use strict'

const helper = require('./../test-helper')
const assert = require('assert')

const suite = new helper.Suite()

suite.test('probe: real PostgreSQL backend termination after Sync', function (done) {
  const client = new helper.Client({ pipeline: true })
  const killer = new helper.Client()
  const events = []
  let finished = false
  let timer

  const finish = function (err) {
    if (finished) return
    finished = true
    clearTimeout(timer)
    killer.end(() => client.end(() => done(err)))
  }

  client.on('error', (err) => {
    events.push(`client.error:${err.code || err.message}`)
    console.log('3772 probe events:', events)
    if (!finished) finish()
  })

  client.on('end', () => {
    events.push('client.end')
    console.log('3772 probe events:', events)
    if (!finished) finish()
  })

  client.connect((err) => {
    if (err) return done(err)

    client.query('SELECT pg_backend_pid() AS pid', (err, result) => {
      if (err) return done(err)
      const pid = result.rows[0].pid

      // Ensure the parameterized query uses the extended protocol and sends Sync.
      client.query({
        text: 'SELECT $1::int AS value',
        values: [1],
      })

      killer.connect((err) => {
        if (err) return done(err)

        killer.query('SELECT pg_terminate_backend($1)', [pid], (err, result) => {
          if (err) return done(err)
          assert.equal(result.rows[0].pg_terminate_backend, true)
        })
      })
    })
  })

  timer = setTimeout(() => {
    console.log('3772 probe timeout events:', events)
    finish(new Error(`timed out waiting for connection termination; events=${events.join(',')}`))
  }, 2000)
})
