const request = require('./request')

const { GITHUB_SHA, GITHUB_EVENT_PATH, GITHUB_TOKEN, GITHUB_WORKSPACE, GITHUB_ACTION } = process.env
console.dir(process.env)
const event = require(GITHUB_EVENT_PATH)
const { repository } = event
const {
  owner: { login: owner }
} = repository
const { name: repo } = repository

const chunk = (arr, size) =>
  Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
    arr.slice(i * size, i * size + size)
  );

const checkName = 'ESLint check'

const headers = {
  'Content-Type': 'application/json',
  Accept: 'application/vnd.github.antiope-preview+json',
  Authorization: `Bearer ${GITHUB_TOKEN}`,
  'User-Agent': 'eslint-action'
}

async function createCheck() {
  const body = {
    name: checkName,
    head_sha: GITHUB_SHA,
    status: 'in_progress',
    started_at: new Date()
  }

  const { data } = await request(`https://api.github.com/repos/${owner}/${repo}/check-runs`, {
    method: 'POST',
    headers,
    body
  })
  const { id } = data
  return id
}

function eslint() {
  const eslint = require('eslint')

  const cli = new eslint.CLIEngine({
    extensions: ['.js', '.ts'],
    ignorePath: '.gitignore'
  })
  const report = cli.executeOnFiles(['./src'])
  // fixableErrorCount, fixableWarningCount are available too
  const { results, errorCount, warningCount } = report

  const levels = ['', 'warning', 'failure']

  const annotations = []
  for (const result of results) {
    const { filePath, messages } = result
    const path = filePath.substring(GITHUB_WORKSPACE.length + 1)
    for (const msg of messages) {
      const { line, severity, ruleId, message } = msg
      const annotationLevel = levels[severity]
      annotations.push({
        path,
        start_line: line,
        end_line: line,
        annotation_level: annotationLevel,
        message: `[${ruleId}] ${message}`
      })
    }
  }

  return {
    conclusion: errorCount > 0 ? 'failure' : 'success',
    output: {
      title: checkName,
      summary: `${errorCount} error(s), ${warningCount} warning(s) found`,
      annotations
    }
  }
}

async function updateCheck(id, conclusion, output) {
  const body = {
    name: checkName,
    head_sha: GITHUB_SHA,
    status: 'completed',
    completed_at: new Date(),
    conclusion,
    output
  }

  const result = await request(`https://api.github.com/repos/${owner}/${repo}/check-runs/${id}`, {
    method: 'PATCH',
    headers,
    body
  })
  console.dir(result);
}

function exitWithError(err) {
  console.error('Error', err.stack)
  if (err.data) {
    console.error(err.data)
  }
  process.exit(1)
}

async function run() {
  const id = GITHUB_ACTION
  
  let checkId;
  
    const result = await request(`https://api.github.com/repos/${owner}/${repo}/commits/${GITHUB_SHA}/check-runs`, {
      method: 'GET',
      headers,
    })
    console.dir(result)


  try {
    const { conclusion, output } = eslint()
    console.log(output.summary)
    const annotationChunks = chunk(output.annotations, 50)
    console.dir(annotationChunks)
    for(let chunk of annotationChunks) {
      const tempOutput = output
      tempOutput.annotations = chunk
      await updateCheck(id, conclusion, tempOutput)
    }
  } catch (err) {
    await updateCheck(id, 'failure')
    exitWithError(err)
  }
}

run().catch(exitWithError)
