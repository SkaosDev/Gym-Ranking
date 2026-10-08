# GymRank: 3-minute demo script

YouTube demo for Phase 1. The video must last **between 2:30 and 3:00**: the
timings below aim for about 2:55, which leaves some margin. About 540 spoken
words, plus a few pauses while something happens on screen. **C** = Clément, **V** = Cyprien. *Screen* lines
say what to show; *(pause)* means let the screen do the talking.

Before recording: `npm run build && npm start`, open http://localhost:3000 and
log in as **alex** (`alex@gymrank.local` / `alex-password`). Check that the
dashboard still says "+2.1 kg on your Bench Press": the demo set below
(107.5 kg × 5) is chosen to clear it. The set is deleted again during the demo,
so the account goes back to how it was.

---

## 0:00 – 0:20 · Intro (C)

*Screen: the poster.*

> Hi, we're Clément and Cyprien, and this is **GymRank**.
> Progress at the gym is slow and hard to see, and that's why many people give up.
> So we turned the gym logbook into a game: every set you log earns you a rank,
> and the app always tells you what it takes to reach the next level.

## 0:20 – 0:50 · Main page: the dashboard (V)

*Screen: the dashboard. Point at the overall rank card, then at the "By
exercise" list, then at the "Week streak" tile.*

> This is the dashboard, the home page. Each exercise Alex trains gets its own
> rank, and together they give an overall rank: here, Gold I, which means
> stronger than about half of lifters. So a rank isn't just a badge, it tells
> you where you really stand.
> And for every lift, the app shows **how many kilos are missing to reach the
> next level**, so each session comes with a clear goal.
> There's also a weekly streak, like in a mobile game: Alex has trained 14
> weeks in a row, and that's a good reason not to skip next week.

## 0:50 – 1:50 · Function 1: logging a set (C)

*Screen: back to the top. Point at "Closest step: +2.1 kg on your Bench
Press".*

> Right now, Alex is 2.1 kilos away from the next level on the bench. Last
> session, Alex did 105 kilos for 5 reps. Today, Alex just did **107.5 kilos
> for 5 reps**, so I'm logging it live.

*Screen: click "Log a set": Bench Press, 107.5 kg, 5 reps, today's date.
(pause while typing) Save.*

> And Bench Press goes up to **Gold I**.

*Screen: History. Open the set just logged, change the reps, save. Then delete
it.*

> Every set goes into the history, where you can edit or delete it, and the
> ranks are recalculated straight away.
> And if you make a typo, say 1050 kilos instead of 105, the app notices the
> jump and puts the set on hold until you confirm it, so one mistake can't
> give you a fake rank.

*Screen: dashboard, click "How ranks work".*

> How is a rank calculated? Lifting 80 kilos isn't the same for a 60-kilo
> student and a 100-kilo athlete. So from each set, the app estimates the
> maximum you could lift once, then compares it with published strength
> standards for your **sex, bodyweight and age**. This page shows the
> calculation step by step.

## 1:50 – 2:10 · Function 2: progress (V)

*Screen: Stats, on Bench Press. Show the first chart, then scroll to "Rank over
time", then the radar. Switch to another exercise at the end.*

> The Stats page shows your progress over the long run. For each exercise,
> the maximum weight you could lift once, estimated from your sets.
> *(scroll)* Then your rank on that lift over time: each dashed line is a
> level, so you see when you passed it.
> *(scroll)* And the radar compares all your lifts, so you know which one is
> lagging behind.

## 2:10 – 2:40 · Function 3: friends (C)

*Screen: Friends. Type a few letters in the search box, then show "Training
together", then the "Progressing together" chart (point at Noah's green line). Then
click "lucas".*

> Last function: friends, because it's easier to keep going when you train
> together. You find someone by username and send a request.
> Once they accept, you see where each of you stands, and your progress side
> by side on the same chart. Look at Noah: a beginner, still well below the
> others, but climbing steadily, level after level. Since each rank is
> calculated for your own body, a beginner sees real progress too.
> *(click lucas)* And on a friend's page you see their ranks, their progress
> and how often they train. The weights you lift stay private.

## 2:40 – 2:55 · Stack (V)

*Screen: the poster, on "Architecture" and "Built with".*

> Technically, it runs locally: a **React** front end, a **Node.js and
> Express** API, and a **SQLite** database. We built it with the help of
> **Claude Code**. Thanks for watching!
