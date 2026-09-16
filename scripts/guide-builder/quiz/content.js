/**
 * Narrative content for the Quiz Games PDF guide. Pure content — no
 * Playwright or filesystem logic lives here (see capture.js for that);
 * this module just turns a capture manifest into the guide's HTML body
 * using the shared building blocks in lib/guide-html.js.
 */

const { section, partDivider, coverPage, tableOfContents, wrapDocument } = require('../lib/guide-html');

function buildQuizGuideHtml({ manifest, appVersion, generatedDate }) {
  const s = manifest.shots;
  const d = manifest.data;

  const cover = coverPage({
    title: 'Quiz Games',
    subtitle: 'Administrator and Player/Team Guide',
    appVersion,
    generatedDate,
  });

  const toc = tableOfContents([
    'Part 1 — Administrator Guide',
    '  Creating and Editing Quiz Games',
    '  Previewing a Quiz',
    '  Starting a Single Session',
    '  Starting a Team Session',
    '  Managing Sessions in Live Quiz',
    '  Hosting a Live (Timed) Round',
    '  The Quiz Performance Report',
    'Part 2 — Player & Team Guide',
    '  Joining a Quiz',
    '  Playing a Timed Round',
    '  Seeing the Reveal and Leaderboard',
    '  Playing a Score-Based Quiz',
  ]);

  const part1Divider = partDivider({
    label: 'Part 1',
    title: 'Administrator Guide',
    blurb: 'How to build a quiz game, start a session or team round, host it live, and review the results.',
  });

  const adminSections = [
    section({
      kicker: 'Quiz Games',
      heading: 'Two Kinds of Quiz Game',
      paragraphs: [
        'Quiz Games are managed from the <strong>Quiz Games</strong> page, reached from the main dashboard. A game is a reusable template of questions — starting a session or a team round always makes an independent snapshot of it, so editing a game later never changes a round that has already been played.',
        'Every game is one of two types. <strong>Score-based</strong> games are self-paced: each player (or team) works through the questions in their own time and submits when ready, exactly like a form. <strong>Timed</strong> games are always played live: everyone answers the same four-option question at the same time, against a countdown, on a screen the host controls.',
      ],
      figures: [{ file: s['p1-01-quiz-games-list'], caption: 'The Quiz Games list, with a Score-based and a Timed game already created.' }],
      tips: [
        'The <strong>Active</strong> toggle in the top-right of the editor hides a game from being started without deleting it.',
        'The type-badge on each list row (blue "Score-based" or purple "Timed") is the fastest way to tell the two apart at a glance.',
      ],
    }),
    section({
      kicker: 'Quiz Games',
      heading: 'Building a Timed Game',
      paragraphs: [
        'Timed games use exactly four answer options per question, one marked correct, plus a time limit in seconds. Speed matters: the score awarded for a correct answer decreases the longer a player takes to answer, so a fast-and-correct answer scores higher than a slow-and-correct one.',
        'The question builder shows a running total of the maximum score achievable, so it is easy to see the effect of adding or removing questions before starting a real session.',
      ],
      figures: [{ file: s['p1-02-quiz-builder-timed'], caption: 'Editing a Timed game — four coloured options per question and a time limit.' }],
    }),
    section({
      kicker: 'Quiz Games',
      heading: 'Building a Score-Based Game',
      paragraphs: [
        'Score-based games support four question types: single-choice (radio), multiple-choice (checkboxes), Yes/No, and free-text paragraphs for manually reviewed answers. Each question carries its own point value, which the app totals automatically.',
        'Because these games are self-paced, there is no time limit — a player can start the quiz, get interrupted, and come back to finish it using the same access code.',
      ],
      figures: [{ file: s['p1-03-quiz-builder-score'], caption: 'Editing a Score-based game with single-choice questions.' }],
    }),
    section({
      kicker: 'Quiz Games',
      heading: 'Previewing a Quiz',
      paragraphs: [
        'The <strong>Preview</strong> button opens a read-only rendering of exactly what a player will see, without creating a session or using up an access code. Use it to proof-read wording and check options before inviting real members.',
      ],
      figures: s['p1-04-quiz-preview'] ? [{ file: s['p1-04-quiz-preview'], caption: 'Preview of a quiz as a player would see it.' }] : [],
    }),
    section({
      kicker: 'Starting a Session',
      heading: 'Starting a Single Session',
      paragraphs: [
        'The <strong>Start Single</strong> button generates one personal access code per selected member — either every active member, or a specific hand-picked selection. Members with a registered email address can be sent their code automatically; the checkbox at the bottom of this dialog controls whether that happens.',
        'Turning the checkbox off still starts the session and generates every code — it simply skips sending the emails, which is useful when codes will be read out or displayed on a screen instead.',
      ],
      figures: [{ file: s['p1-05-start-single-modal'], caption: 'The Start Single dialog, with the email notification checkbox at the bottom.' }],
      tips: ['Score-based and Timed games can both be started as a Single session — a Timed single session is still played live, one player at a time, via the host screen described later in this guide.'],
    }),
    section({
      kicker: 'Starting a Session',
      heading: 'Starting a Team Session',
      paragraphs: [
        `The <strong>Start Teams</strong> button opens a drag-and-drop board: members start in an "Unassigned" pool on the left and are dragged into two or more team columns. Every team receives a single shared access code — whichever device enters that code first becomes the team's screen for the rest of the round.`,
        `${d ? `In this example, "${d.team1?.name}" and "${d.team2?.name}" were set up from members drawn from the same pool as any other quiz.` : 'Team names are freely editable — rename each column before starting.'}`,
      ],
      figures: [{ file: s['p1-06-start-teams-modal'], caption: 'Two teams assigned from the member pool, ready to start.' }],
      tips: ['At least two teams, each with at least one member, are required before the Start Team Session button will submit.'],
    }),
    section({
      kicker: 'Live Quiz',
      heading: 'Managing Single Sessions',
      paragraphs: [
        'Every session started from Quiz Games appears under <strong>Live Quiz → Single Sessions</strong>. From here an administrator can re-send an invitation, open the results for a submitted player, or archive a finished session to keep the list tidy.',
      ],
      figures: [
        { file: s['p1-07-live-quiz-single-list'], caption: 'The Single Sessions list.' },
        { file: s['p1-08-live-quiz-single-detail'], caption: 'Session detail — one access code and status per invited member.' },
      ],
    }),
    section({
      kicker: 'Live Quiz',
      heading: 'The Live Leaderboard (Score Sessions)',
      paragraphs: [
        'For a Score-based session, the <strong>Launch</strong> button opens a self-refreshing leaderboard — ideal for projecting on a screen at an event while self-paced players submit their answers on their own devices.',
      ],
      figures: s['p1-11-quiz-leaderboard-live'] ? [{ file: s['p1-11-quiz-leaderboard-live'], caption: 'The live leaderboard for a Score-based session.' }] : [],
    }),
    section({
      kicker: 'Live Quiz',
      heading: 'Managing Team Sessions',
      paragraphs: [
        'The <strong>Team Setups</strong> tab lists every team round. Opening a setup shows each team\'s name, roster, and access code — useful for re-printing a code a captain has lost, or checking who was assigned to which team after the fact.',
      ],
      figures: [
        { file: s['p1-09-live-quiz-teams-list'], caption: 'The Team Setups list.' },
        { file: s['p1-10-live-quiz-team-detail'], caption: 'Team detail — roster and access code for each team.' },
      ],
    }),
    section({
      kicker: 'Hosting a Live Round',
      heading: 'The Host Lobby',
      paragraphs: [
        `For a Timed game, <strong>Launch</strong> opens the host screen — intended to be projected or shared on a shared display. It starts on a lobby that lists every player or team and turns their chip green as they join with their code.`,
        'Nothing happens until the host presses <strong>START</strong> — there is no rush, and the round only begins once everyone (or as many as are expected) has joined.',
      ],
      figures: [
        { file: s['p1-12-host-lobby-empty'], caption: 'The host lobby immediately after launching, before anyone has joined.' },
        { file: s['p1-13-host-lobby-joined'], caption: 'The same lobby once both teams have entered their code.' },
      ],
    }),
    section({
      kicker: 'Hosting a Live Round',
      heading: 'Running a Question',
      paragraphs: [
        'Once started, the host screen shows the current question, its four colour-coded options, a countdown bar, and a live count of how many players or teams have answered so far — so the host always knows whether to wait a little longer.',
        d ? `In this example, one team answered <strong>"${d.wrongQ1}"</strong> and the other answered <strong>"${d.correctQ1}"</strong> (the correct option).` : '',
      ],
      figures: [{ file: s['p1-14-host-answered-count'], caption: 'A question in progress, with the answered-count updating live as teams respond.' }],
    }),
    section({
      kicker: 'Hosting a Live Round',
      heading: 'Reveal and Leaderboard',
      paragraphs: [
        'When the timer runs out — or the host reveals early — every incorrect option greys out and the correct one stays highlighted. The host then advances to a leaderboard ranked by total score so far, and from there either continues to the next question or, on the final question, finishes the round.',
      ],
      figures: [
        { file: s['p1-15-host-reveal'], caption: 'The reveal screen — the correct option stays coloured, the rest grey out.' },
        { file: s['p1-16-host-leaderboard-next'], caption: 'The leaderboard between questions, with a "Next Question" button.' },
        { file: s['p1-17-host-leaderboard-finish'], caption: 'The leaderboard after the final question — the button now reads "Finish Quiz".' },
        { file: s['p1-18-host-finished'], caption: 'The final screen once the round is finished.' },
      ],
      tips: ['If the host\'s browser tab is closed or loses connection, every joined player sees a "Host disconnected" banner until the host screen is reopened — nothing is lost, and the round resumes exactly where it left off.'],
    }),
    section({
      kicker: 'Reporting',
      heading: 'The Quiz Performance Report',
      paragraphs: [
        'The <strong>Quiz Performance</strong> report, found under Reports, summarises every quiz game played over a configurable lookback period — average score, completion rate, and how each question performed across all participants — useful for spotting a question that is confusing everyone rather than testing the intended skill.',
      ],
      figures: [{ file: s['p1-19-quiz-performance-report'], caption: 'The Quiz Performance report.' }],
    }),
  ];

  const part2Divider = partDivider({
    label: 'Part 2',
    title: 'Player & Team Guide',
    blurb: 'What a member sees on their own phone when they join a quiz, whether playing solo or as part of a team.',
  });

  const playerSections = [
    section({
      kicker: 'Joining',
      heading: 'Joining With a Code',
      paragraphs: [
        'A player reaches a quiz one of two ways: by tapping a personal link sent by email, or by going to <strong>/quiz</strong> on their phone and typing in the code they were given. A team round works the same way — whoever on the team enters the code first becomes that team\'s screen for the round.',
      ],
      figures: [{ file: s['p2-01-join-page-blank'], caption: 'The join screen, ready for a code.', mobile: true }],
    }),
    section({
      kicker: 'Timed Rounds',
      heading: 'Waiting in the Lobby',
      paragraphs: [
        'After entering a valid code for a Timed round, a player or team lands on a waiting screen until the host presses START — there is nothing to do here but wait.',
      ],
      figures: [{ file: s['p2-02-lobby-waiting'], caption: 'Waiting for the host to start the round.', mobile: true }],
    }),
    section({
      kicker: 'Timed Rounds',
      heading: 'If the Host Disconnects',
      paragraphs: [
        'If the host\'s screen closes or loses its connection — even briefly, between questions — every joined player sees a clear banner explaining the host has disconnected. This clears automatically the moment the host screen reconnects; no one needs to rejoin.',
      ],
      figures: s['p2-03-host-disconnected-banner'] ? [{ file: s['p2-03-host-disconnected-banner'], caption: 'The host-disconnected banner, shown while waiting for the host to reconnect.', mobile: true }] : [],
    }),
    section({
      kicker: 'Timed Rounds',
      heading: 'Answering a Question',
      paragraphs: [
        'Once the host starts the round, every player sees the same question and four colour-coded options at once, with a shrinking bar showing how much time is left. Tapping an option locks it in immediately — there is no changing an answer once submitted, so it pays to be sure.',
      ],
      figures: [{ file: s['p2-04-question-in-progress'], caption: 'A question in progress, with the countdown bar above it.', mobile: true }],
    }),
    section({
      kicker: 'Timed Rounds',
      heading: 'Seeing the Reveal',
      paragraphs: [
        'When the host reveals the answer, a player who answered correctly sees a tick on their chosen option. A player who answered incorrectly instead sees a cross on the option they picked, while the correct option is still shown highlighted alongside it — so it is always clear both what was chosen and what the right answer was.',
      ],
      figures: [
        { file: s['p2-05-reveal-wrong'], caption: 'The reveal screen for a team that answered incorrectly — a cross marks their pick.', mobile: true },
        { file: s['p2-06-reveal-correct'], caption: 'The reveal screen for a team that answered correctly — a tick marks their pick.', mobile: true },
      ],
    }),
    section({
      kicker: 'Timed Rounds',
      heading: 'Between Questions and at the End',
      paragraphs: [
        'Between questions, the same progress bar that showed the countdown switches to show overall progress through the round (for example, one question down out of six is shown as roughly 16%), alongside a leaderboard of every player or team\'s running score. At the end of the last question, this becomes the final leaderboard.',
      ],
      figures: [
        { file: s['p2-07-leaderboard-progress'], caption: 'The leaderboard and progress bar shown between questions.', mobile: true },
        { file: s['p2-08-finished-leaderboard'], caption: 'The final leaderboard once the round is finished.', mobile: true },
      ],
    }),
    section({
      kicker: 'Score-Based Quizzes',
      heading: 'Playing a Score-Based Quiz',
      paragraphs: [
        'A Score-based quiz looks and behaves like any other online form: every question is shown at once, there is no clock, and the player submits when they are done. The result — a final score out of the maximum possible — is shown immediately after submitting.',
      ],
      figures: [
        { file: s['p2-09-score-form'], caption: 'A self-paced, Score-based quiz.', mobile: true },
        { file: s['p2-10-score-result'], caption: 'The result screen shown immediately after submitting.', mobile: true },
      ],
    }),
  ];

  const body = [
    cover,
    toc,
    part1Divider,
    ...adminSections,
    part2Divider,
    ...playerSections,
  ].join('\n');

  return wrapDocument(body);
}

module.exports = { buildQuizGuideHtml };
