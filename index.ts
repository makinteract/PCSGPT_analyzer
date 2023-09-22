// Constants
const MAX_SIMULTANEOUS_QUERIES = 100;
const PAUSE = 30 * 1000;
const PROMPT =
  'Is this paper discussing or using a machine learning (ML), or large language models (LLMs) techniques? Give a conservative answer to minimize false positives. Simply answer "true" or "false".';

// Start code from here
import data from './data.json';
import OpenAI from 'openai';
import chalk from 'chalk';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Types
type Paper = {
  id: number;
  title: string;
  abstract: string;
};

// Data processing
const papers = data
  .map((x): Paper => {
    return {
      id: parseInt(x[2] as any),
      title: '' + x[3],
      abstract: '' + x[9],
    };
  })
  .sort((a, b) => {
    return a.id - b.id;
  });

const totPapers = papers.length;

// Main

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

const result: any = [];

for (let i = 0; i < totPapers / MAX_SIMULTANEOUS_QUERIES; i++) {
  const min = i * MAX_SIMULTANEOUS_QUERIES;
  const tempMax = (i + 1) * MAX_SIMULTANEOUS_QUERIES;
  const max = tempMax < totPapers ? tempMax : totPapers;

  console.log(
    chalk.green(
      `Analyzing papers from ${min} [id: ${papers[min].id}] to ${
        max - 1
      } [id: ${papers[max - 1].id}]`
    )
  );

  const annotateWitQuestion = await Promise.all(
    papers.slice(min, max).map(async ({ id, title, abstract }) => {
      const question = `Title: ${title}\nAbstract:${abstract}`;

      const answer = await getExplanation(question, PROMPT);
      return {
        id,
        title,
        abstract,
        matchQuery: answer?.toLowerCase(),
      };
    })
  );
  result.push(...annotateWitQuestion);
  console.log(chalk.bgGreen('Waiting (free OpenAI account, ok??)...'));
  await delay(PAUSE);
}

// Write to file

const path = 'results.json';
await Bun.write(path, JSON.stringify(result));

// Analysis of results

const matchQuery = result.filter((paper) => paper.matchQuery === 'true');

const perc = ((100 * matchQuery.length) / result.length).toFixed(1);
console.log(
  chalk.red(
    `${matchQuery.length} papers out of ${result.length} (${perc}%) matched the query:`
  )
);
console.log(chalk.magenta(PROMPT));

// Helpers
async function getExplanation(input: string, question: string) {
  try {
    const stop = '###\n';
    const prompt = input + stop + question;

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: prompt,
        },
        {
          role: 'assistant',
          content: 'false',
        },
      ],
      temperature: 0,
      max_tokens: 500,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
      stop: ['###'],
    });

    const { content } = response.choices[0]?.message;

    return content;
  } catch (error: any) {
    if (error.response) {
      console.log(error.response.status); // e.g. 401
      console.log(error.response.data.message); // e.g. The authentication token you passed was invalid...
      console.log(error.response.data.code); // e.g. 'invalid_api_key'
      console.log(error.response.data.type); // e.g. 'invalid_request_error'
    } else {
      console.log(error);
    }
  }
}
