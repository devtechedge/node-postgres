'use strict'

const helper = require('./../test-helper')
const assert = require('assert')

const suite = new helper.Suite()

suite.test('real PostgreSQL backend termination after Sync surfaces connection failure', function (done) {
  const client = new helper.Client({ pipeline: true })
  const killer = new helper.Client()
  let finished = false
  let timer

  const finish = function (err) {
    if (finished) return
    finished = true
    clearTimeout(timer)
    killer.end(() => client.end(() => done(err)))
  }

  client.on('error', function (err) {
    assert(err instanceof Error)
    finish()
  })

  client.on('end', function () {
    if (!finished) finish()
  })

  client.connect(function (err) {
    if (err) return done(err)

    client.query('SELECT pg_backend_pid() AS pid', function (err, result) {
      if (err) return done(err)
      const pid = result.rows[0].pid

      // Force the extended-query protocol, which sends Sync after the query.
      client.query({
        text: 'SELECT $1::int AS value',
        values: [1],
      })

      killer.connect(function (err) {
        if (err) return done(err)
        killer.query('SELECT pg_terminate_backend($1)', [pid], function (err, result) {
          if (err) return done(err)
          assert.equal(result.rows[0].pg_terminate_backend, true)
        })
      })
    })
  })

  timer = setTimeout(function () {
    finish(new Error('timed out waiting for PostgreSQL connection termination'))
  }, 2000)
})
