/**
 * Demo lecture template decks for Academic, Faith, and Training styles.
 * Used in TemplateGallery as built-in starter decks.
 */
import type { Json } from "@/integrations/supabase/types";

export interface DemoSlide {
  block_type: string;
  content: Json;
  notes?: string;
}

export interface DemoLectureDeck {
  id: string;
  title: string;
  category: string;
  description: string;
  style: "academic" | "faith" | "training";
  slides: DemoSlide[];
}

export const DEMO_LECTURE_DECKS: DemoLectureDeck[] = [
  {
    id: "demo-academic",
    title: "Academic Lecture: Critical Thinking",
    category: "Academic Lecture",
    description: "A structured university-style lecture with objectives, concepts, and assessments.",
    style: "academic",
    slides: [
      {
        block_type: "title",
        content: { heading: "Introduction to Critical Thinking", subheading: "Analyzing Arguments & Evaluating Evidence", instructor: "Dr. Example" },
        notes: "Welcome students. Today we'll explore the foundations of critical thinking.",
      },
      {
        block_type: "lesson-objective",
        content: {
          heading: "Learning Objectives",
          objectives: [
            "Define critical thinking and its core components",
            "Identify logical fallacies in arguments",
            "Apply evidence evaluation frameworks",
            "Construct well-reasoned arguments",
          ],
        },
        notes: "Walk through each objective. Ask students which they find most interesting.",
      },
      {
        block_type: "concept",
        content: {
          heading: "What Is Critical Thinking?",
          explanation: "Critical thinking is the disciplined process of actively analyzing, synthesizing, and evaluating information gathered from observation, experience, or communication. It involves questioning assumptions, recognizing biases, and drawing reasoned conclusions.",
          keyTerms: ["Analysis", "Synthesis", "Evaluation", "Inference"],
        },
        notes: "Use the Socratic method here — ask students for their definitions first.",
      },
      {
        block_type: "bullets",
        content: {
          heading: "The 5 Steps of Critical Analysis",
          bullets: [
            "1. Identify the claim or argument",
            "2. Examine the evidence presented",
            "3. Check for logical fallacies",
            "4. Consider alternative perspectives",
            "5. Form a reasoned conclusion",
          ],
        },
        notes: "Spend about 2 minutes on each step with examples.",
      },
      {
        block_type: "quiz",
        content: {
          question: "Which of the following is an example of an 'ad hominem' fallacy?",
          options: [
            "Attacking the person making the argument instead of the argument itself",
            "Using statistics to support a claim",
            "Presenting multiple perspectives on an issue",
            "Drawing conclusions from evidence",
          ],
          correctIndex: 0,
          explanation: "An ad hominem fallacy attacks the character of the person rather than addressing the substance of their argument.",
        },
        notes: "Give students 60 seconds to answer. Discuss why the other options are valid reasoning techniques.",
      },
      {
        block_type: "activity",
        content: {
          heading: "Group Activity: Spot the Fallacy",
          instructions: "In groups of 3, read the provided news articles. Identify at least 2 logical fallacies in each article. Be prepared to present your findings.",
          duration: "10 minutes",
        },
        notes: "Circulate among groups. Prompt struggling groups with leading questions.",
      },
      {
        block_type: "key-takeaway",
        content: {
          heading: "Key Takeaways",
          takeaways: [
            "Critical thinking is a skill that improves with practice",
            "Always question assumptions and look for evidence",
            "Recognizing fallacies helps you evaluate arguments objectively",
          ],
        },
        notes: "Summarize and preview next week's topic on evidence evaluation frameworks.",
      },
      {
        block_type: "progress-checkpoint",
        content: {
          heading: "Session Progress",
          totalSteps: 4,
          completedSteps: 4,
          label: "Lecture Complete",
        },
      },
    ],
  },
  {
    id: "demo-faith",
    title: "Faith Teaching: The Beatitudes",
    category: "Faith Teaching",
    description: "A sermon-style teaching with scripture study, reflection, and application.",
    style: "faith",
    slides: [
      {
        block_type: "title",
        content: { heading: "The Beatitudes", subheading: "Living the Blessed Life — Matthew 5:1-12" },
        notes: "Open with prayer. Set the context of the Sermon on the Mount.",
      },
      {
        block_type: "lesson-objective",
        content: {
          heading: "Today's Focus",
          objectives: [
            "Understand the historical context of the Beatitudes",
            "Explore what 'blessed' truly means in the original language",
            "Apply each beatitude to daily living",
          ],
        },
        notes: "Encourage the congregation to follow along in their Bibles.",
      },
      {
        block_type: "scripture",
        content: {
          heading: "Matthew 5:3-6",
          passage: "Blessed are the poor in spirit, for theirs is the kingdom of heaven.\nBlessed are those who mourn, for they will be comforted.\nBlessed are the meek, for they will inherit the earth.\nBlessed are those who hunger and thirst for righteousness, for they will be filled.",
          reference: "Matthew 5:3-6 (NIV)",
          commentary: "The Greek word 'makarios' (blessed) doesn't mean happy in the modern sense — it describes a deep, abiding joy that comes from being in right relationship with God, regardless of circumstances.",
        },
        notes: "Read the passage aloud slowly. Let it sink in. Then explain the Greek context.",
      },
      {
        block_type: "concept",
        content: {
          heading: "Poor in Spirit ≠ Poverty",
          explanation: "Being 'poor in spirit' means recognizing our complete dependence on God. It's spiritual humility — acknowledging that without God, we have nothing of eternal value. This is the foundation of all the other beatitudes.",
          keyTerms: ["Humility", "Dependence", "Surrender"],
        },
        notes: "Share a personal story about a moment of spiritual poverty that led to growth.",
      },
      {
        block_type: "guided-notes",
        content: {
          heading: "Reflection Questions",
          prompts: [
            "In what area of your life do you need to practice spiritual humility?",
            "When was the last time you truly mourned — and how did God comfort you?",
            "What does 'meekness' look like in your workplace or home?",
          ],
        },
        notes: "Give 3-4 minutes of quiet reflection time. Play soft background music if available.",
      },
      {
        block_type: "activity",
        content: {
          heading: "Small Group Discussion",
          instructions: "Turn to your neighbor and share: Which beatitude challenges you the most right now, and why?",
          duration: "5 minutes",
        },
        notes: "Walk around and listen. Prepare to share one or two themes you overhear (with permission).",
      },
      {
        block_type: "key-takeaway",
        content: {
          heading: "Living It Out This Week",
          takeaways: [
            "Choose one beatitude to focus on each day this week",
            "Journal one moment where you see God's blessing in unexpected places",
            "Pray for the humility to be 'poor in spirit' in your daily interactions",
          ],
        },
        notes: "Close with prayer. Invite anyone who wants to talk further to stay after.",
      },
    ],
  },
  {
    id: "demo-training",
    title: "Training Workshop: Effective Communication",
    category: "Training Workshop",
    description: "A corporate training session with skills practice, scenarios, and assessments.",
    style: "training",
    slides: [
      {
        block_type: "title",
        content: { heading: "Effective Communication Skills", subheading: "Workshop — Building Stronger Teams Through Better Communication" },
        notes: "Welcome participants. Ask everyone to introduce themselves with their name and communication challenge.",
      },
      {
        block_type: "lesson-objective",
        content: {
          heading: "Workshop Goals",
          objectives: [
            "Master the 4 communication styles and when to use each",
            "Practice active listening techniques",
            "Handle difficult conversations with confidence",
            "Build a personal communication improvement plan",
          ],
        },
        notes: "Set expectations: this is interactive. Phones away, participation is key.",
      },
      {
        block_type: "concept",
        content: {
          heading: "The 4 Communication Styles",
          explanation: "Everyone defaults to one of four communication styles: Assertive, Passive, Aggressive, or Passive-Aggressive. Understanding your default style — and learning to flex between styles — is the foundation of effective communication.",
          keyTerms: ["Assertive", "Passive", "Aggressive", "Passive-Aggressive"],
        },
        notes: "Use the quadrant diagram. Ask participants to self-identify (privately).",
      },
      {
        block_type: "quiz",
        content: {
          question: "Your colleague repeatedly takes credit for your ideas in meetings. Which response is ASSERTIVE?",
          options: [
            "Say nothing and feel resentful (Passive)",
            "Publicly call them out in the next meeting (Aggressive)",
            "Have a private conversation: 'I noticed X happened. I'd like to discuss how we credit ideas going forward.' (Assertive)",
            "Agree with them but complain to others afterward (Passive-Aggressive)",
          ],
          correctIndex: 2,
          explanation: "Assertive communication addresses the issue directly, respectfully, and privately — focusing on behavior and outcomes rather than character attacks.",
        },
        notes: "Let participants discuss in pairs before revealing the answer.",
      },
      {
        block_type: "activity",
        content: {
          heading: "Role-Play: The Difficult Conversation",
          instructions: "In pairs, practice the scenario provided on the handout. One person plays the manager, the other the team member. Switch roles after 3 minutes. Use the assertive communication framework: State, Explain, Specify, Consequence (DESC).",
          duration: "8 minutes",
        },
        notes: "Demonstrate the DESC framework once before they start. Circulate and coach.",
      },
      {
        block_type: "guided-notes",
        content: {
          heading: "Your Communication Action Plan",
          prompts: [
            "My default communication style is: ___",
            "One situation where I need to be more assertive: ___",
            "The active listening technique I'll practice this week: ___",
            "My accountability partner for this plan: ___",
          ],
        },
        notes: "Give 5 minutes to complete. Encourage sharing with a partner for accountability.",
      },
      {
        block_type: "recap",
        content: {
          heading: "Workshop Recap",
          points: [
            "Know your default communication style — then learn to flex",
            "Active listening is a skill, not a talent — practice it daily",
            "Use DESC for difficult conversations: Describe, Explain, Specify, Consequence",
            "Accountability drives change — share your plan with someone",
          ],
        },
        notes: "Thank participants. Distribute feedback survey links.",
      },
      {
        block_type: "progress-checkpoint",
        content: {
          heading: "Workshop Complete!",
          totalSteps: 4,
          completedSteps: 4,
          label: "All modules covered",
        },
      },
    ],
  },
];
