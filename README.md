# SAO Study As Otaku

An anime-themed study app with two modes:

- **GK mode** — live, date-bounded general-knowledge MCQs backed by Tavily search.
- **Subject mode** — AI-generated exams from your syllabus/notes, with MCQ and
  written-answer questions. Written answers are marked by AI with **partial
  credit**, a rubric breakdown, and feedback.

## Local development

```bash
cp .env.example .env
# put your real keys in .env
npm install
npm start
```

Open <http://localhost:3000>. Do **not** use a static preview server such as
VS Code Live Server — the `/api/chat` and `/api/search` routes need Node.

## Deploy to Vercel (GitHub)

1. Push this repository to GitHub.
2. In Vercel, choose **Add New → Project** and import the GitHub repository.
3. Vercel auto-detects the static site and the `api/` serverless functions.
   Leave the framework preset as **Other** and the build command as `npm run build`.
4. Add these Environment Variables in **Project → Settings → Environment Variables**
   (for Production, Preview and Development):

   | Name | Value |
   | --- | --- |
   | `MY_SECRET_API_KEY` | OpenRouter API key |
   | `TAVILY_API_KEY` | Tavily API key |
   | `PUBLIC_SITE_URL` | Your production URL (optional) |

5. Click **Deploy**. After adding/changing env vars, **redeploy** so the
   serverless functions pick them up.

### Notes

- `.env` files stay local and are gitignored. Never commit real keys.
- `package.json` has no runtime dependencies, so the Vercel build is just static
  output plus the two functions in `api/`.
- `vercel.json` raises the serverless timeout to 60 seconds, which is enough for
  a single AI question or grading call.

## Question format rules

- MCQ questions show A–D options and are worth 1 mark.
- Written questions show a text box. The AI marks the answer against the model
  answer and rubric, awards partial marks for correct method/working, and shows a
  criteria-by-criteria breakdown.
- Blueprint behaviour:
  - No written type selected → all MCQ.
  - `Descriptive / Written` selected with other types → mostly MCQ, every 4th
    question written.
  - Only `Descriptive / Written` selected → all written.
  - `Mixed` selected → roughly one written question every three.
