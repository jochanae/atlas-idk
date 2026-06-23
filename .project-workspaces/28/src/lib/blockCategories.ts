import { BookOpen, BarChart3, User, Quote, LayoutTemplate, Target, GitCompare, MessageSquareQuote, Type, Video, Table2, BarChart2, ImageIcon, Clapperboard, ClipboardCheck, GraduationCap, Lightbulb, Dumbbell, Milestone } from "lucide-react";
import type { Json } from "@/integrations/supabase/types";

export interface BlockCategory {
  type: string;
  label: string;
  icon: typeof BookOpen;
  description: string;
  tooltip: string;
  color: string;
}

export const BLOCK_CATEGORIES: BlockCategory[] = [
  {
    type: "story",
    label: "Stories",
    icon: BookOpen,
    description: "Narrative blocks that connect emotionally with your audience through personal anecdotes, case studies, or origin stories.",
    tooltip: "A Story block is a narrative slide — share a personal experience, customer journey, or founding moment to build trust and engagement.",
    color: "text-blue-500",
  },
  {
    type: "data",
    label: "Data & Metrics",
    icon: BarChart3,
    description: "Highlight key numbers, statistics, and data points that prove your claims and build credibility.",
    tooltip: "A Data block showcases a key metric or statistic. Use it to add evidence and credibility to your message — e.g. '85% of users saw ROI in 30 days.'",
    color: "text-emerald-500",
  },
  {
    type: "bio",
    label: "Bios & Intros",
    icon: User,
    description: "Introduce yourself, your team, or key stakeholders. Establish authority and build rapport.",
    tooltip: "A Bio block introduces a person — yourself, a team member, or an expert. Include name, role, and a brief background to build credibility.",
    color: "text-violet-500",
  },
  {
    type: "quote",
    label: "Quotes",
    icon: Quote,
    description: "Powerful quotes, testimonials, and endorsements that reinforce your message through social proof.",
    tooltip: "A Quote block features a memorable quote or testimonial. Use it for social proof, inspiration, or to punctuate a key point.",
    color: "text-amber-500",
  },
  {
    type: "framework",
    label: "Frameworks",
    icon: LayoutTemplate,
    description: "Step-by-step processes, methodologies, and mental models that structure complex ideas into clear, actionable steps.",
    tooltip: "A Framework block presents a process or methodology — like a 3-step plan, decision matrix, or mental model. It helps your audience follow complex ideas.",
    color: "text-pink-500",
  },
  {
    type: "cta",
    label: "Calls to Action",
    icon: Target,
    description: "Drive your audience to take the next step — sign up, buy, schedule a call, or learn more.",
    tooltip: "A CTA (Call to Action) block tells your audience exactly what to do next — visit a URL, schedule a meeting, or sign up. Every deck needs at least one.",
    color: "text-red-500",
  },
  {
    type: "comparison",
    label: "Comparisons",
    icon: GitCompare,
    description: "Side-by-side comparisons that highlight differences, before/after scenarios, or competitive advantages.",
    tooltip: "A Comparison block shows two options side by side — before vs. after, your solution vs. competitors, or old way vs. new way.",
    color: "text-cyan-500",
  },
  {
    type: "testimonial",
    label: "Testimonials",
    icon: MessageSquareQuote,
    description: "Customer success stories and endorsements that prove your solution works through real-world validation.",
    tooltip: "A Testimonial block features a customer's own words about their experience. The most powerful form of social proof.",
    color: "text-orange-500",
  },
  {
    type: "title",
    label: "Title Slides",
    icon: Type,
    description: "Opening slides, section headers, and transition slides that structure your presentation flow.",
    tooltip: "A Title block is your opening slide or section divider. Use a bold heading and optional subtitle to set the stage.",
    color: "text-slate-500",
  },
  {
    type: "chart",
    label: "Charts",
    icon: BarChart2,
    description: "Visual data representations including bar charts, line charts, and more to make numbers tell a story.",
    tooltip: "A Chart block visualizes data as a bar chart. Great for showing trends, comparisons, or progress over time.",
    color: "text-teal-500",
  },
  {
    type: "table",
    label: "Tables",
    icon: Table2,
    description: "Structured data in rows and columns for detailed comparisons, pricing, features, or specifications.",
    tooltip: "A Table block displays structured data in rows and columns — perfect for pricing, feature comparisons, or specifications.",
    color: "text-indigo-500",
  },
  {
    type: "video",
    label: "Video Embeds",
    icon: Video,
    description: "Embed YouTube, Loom, or other video content directly into your presentation.",
    tooltip: "A Video block embeds a YouTube or Loom video. Use it for demos, walkthroughs, or testimonial clips.",
    color: "text-rose-500",
  },
  {
    type: "gif",
    label: "GIFs & Animations",
    icon: ImageIcon,
    description: "Add animated GIFs or Lottie animations to bring your slides to life with motion.",
    tooltip: "A GIF block embeds an animated image or Lottie animation. Perfect for product demos, reactions, or visual flair.",
    color: "text-fuchsia-500",
  },
  {
    type: "lottie",
    label: "Lottie Animations",
    icon: Clapperboard,
    description: "Embed high-quality Lottie animations (JSON) for smooth, scalable motion graphics.",
    tooltip: "A Lottie block renders vector animations from a JSON URL. Great for icons, loading states, or explainer graphics.",
    color: "text-lime-500",
  },
  // ─── Educational / Course Blocks ───
  {
    type: "quiz",
    label: "Quiz / Assessment",
    icon: ClipboardCheck,
    description: "Multiple choice, true/false, or open-ended questions to test learner understanding.",
    tooltip: "A Quiz block adds an interactive question to your slide. Use it to check understanding, engage learners, or create knowledge checks.",
    color: "text-sky-500",
  },
  {
    type: "lesson-objective",
    label: "Lesson Objective",
    icon: GraduationCap,
    description: "Define what learners will know or be able to do by the end of a module or lesson.",
    tooltip: "A Lesson Objective block sets clear learning goals — 'By the end of this module, you'll be able to…' — so learners know what to expect.",
    color: "text-emerald-600",
  },
  {
    type: "key-takeaway",
    label: "Key Takeaway",
    icon: Lightbulb,
    description: "Highlighted summary card that reinforces the most important point from a section.",
    tooltip: "A Key Takeaway block emphasizes the single most important idea from a lesson or section. Place it at the end of a module for reinforcement.",
    color: "text-yellow-500",
  },
  {
    type: "activity",
    label: "Activity / Exercise",
    icon: Dumbbell,
    description: "Hands-on task instructions that prompt learners to apply what they've learned.",
    tooltip: "An Activity block gives learners a task to complete — a writing exercise, group discussion, or practical challenge.",
    color: "text-purple-500",
  },
  {
    type: "progress-checkpoint",
    label: "Progress Checkpoint",
    icon: Milestone,
    description: "Visual progress marker between sections showing how far the learner has come.",
    tooltip: "A Progress Checkpoint block shows a visual progress bar and section summary. Use it between modules to orient learners.",
    color: "text-green-500",
  },
  // ─── New Educational Blocks ───
  {
    type: "concept",
    label: "Concept Explanation",
    icon: Lightbulb,
    description: "Break down a complex idea with a clear definition, visual analogy, and real-world example.",
    tooltip: "A Concept block explains a key idea — definition, analogy, and example — making abstract topics concrete for any audience.",
    color: "text-blue-400",
  },
  {
    type: "guided-notes",
    label: "Guided Notes",
    icon: ClipboardCheck,
    description: "Fill-in-the-blank or structured note-taking prompt that keeps learners actively engaged.",
    tooltip: "A Guided Notes block provides a note-taking template with blanks or prompts for learners to fill in during the lesson.",
    color: "text-amber-600",
  },
  {
    type: "scripture",
    label: "Scripture / Text Study",
    icon: BookOpen,
    description: "Display a passage of text (scripture, poetry, legal code) with commentary and reflection prompts.",
    tooltip: "A Scripture block presents a text passage with verse references, commentary, and reflection questions — perfect for Bible study, literature, or legal training.",
    color: "text-indigo-400",
  },
  {
    type: "recap",
    label: "Recap / Reinforcement",
    icon: GraduationCap,
    description: "End-of-section summary with key points, action items, and a 'what to remember' callout.",
    tooltip: "A Recap block summarises a section with bullet points, action items, and a memorable closing thought to reinforce learning.",
    color: "text-teal-400",
  },
];

export function getCategoryByType(type: string): BlockCategory | undefined {
  return BLOCK_CATEGORIES.find((c) => c.type === type);
}

export function getCategoryLabel(type: string): string {
  return getCategoryByType(type)?.label || type;
}

// Starter example blocks for each category
export interface StarterBlock {
  name: string;
  block_type: string;
  description: string;
  content: Json;
  tags: string[];
}

export const STARTER_BLOCKS: StarterBlock[] = [
  {
    name: "Origin Story",
    block_type: "story",
    description: "Share how you or your company got started. Audiences remember stories 22x more than facts alone.",
    content: { heading: "How It All Started", body: "Three years ago, I was sitting in a coffee shop when I realized there had to be a better way...", layout: "left" },
    tags: ["starter", "narrative"],
  },
  {
    name: "Key Metric Spotlight",
    block_type: "data",
    description: "Highlight a single, powerful number that proves your point. Less is more — one metric per slide.",
    content: { heading: "The Impact", metric: "3.2×", description: "Average ROI within the first 90 days of implementation", layout: "center" },
    tags: ["starter", "evidence"],
  },
  {
    name: "Speaker Bio",
    block_type: "bio",
    description: "Introduce yourself in 3 sentences: who you are, what you do, and why the audience should listen to you.",
    content: { heading: "About the Speaker", name: "Your Name", role: "Your Title", body: "15+ years helping teams communicate better. Previously at [Company]. Author of [Book/Achievement].", layout: "left" },
    tags: ["starter", "introduction"],
  },
  {
    name: "Inspirational Quote",
    block_type: "quote",
    description: "Use a quote to reinforce a key message. Works best placed after a data slide to add emotional weight.",
    content: { quote: "The single biggest problem in communication is the illusion that it has taken place.", attribution: "George Bernard Shaw", layout: "center" },
    tags: ["starter", "inspiration"],
  },
  {
    name: "3-Step Process",
    block_type: "framework",
    description: "Break a complex idea into 3 clear steps. The 'rule of three' makes information memorable and actionable.",
    content: { heading: "Our Approach", steps: ["Step 1: Discover — Understand the core challenge", "Step 2: Design — Build a tailored solution", "Step 3: Deliver — Execute with measurable results"], layout: "columns" },
    tags: ["starter", "methodology"],
  },
  {
    name: "Next Steps CTA",
    block_type: "cta",
    description: "End every presentation with a clear next step. Tell the audience exactly what to do and make it easy.",
    content: { heading: "Ready to Get Started?", body: "Book a free 15-minute strategy call and we'll show you how to get results in 30 days.", buttonText: "Schedule a Call", layout: "center" },
    tags: ["starter", "closing"],
  },
  {
    name: "Before vs. After",
    block_type: "comparison",
    description: "Show the transformation your solution creates. The contrast makes your value proposition instantly clear.",
    content: { heading: "The Transformation", left: { title: "Before", points: ["Manual processes", "Hours of wasted time", "Inconsistent results"] }, right: { title: "After", points: ["Automated workflow", "2-minute setup", "Reliable outcomes"] }, layout: "split" },
    tags: ["starter", "transformation"],
  },
  {
    name: "Customer Success",
    block_type: "testimonial",
    description: "Let a happy customer tell your story. Include their name, role, and a specific result they achieved.",
    content: { quote: "We cut our preparation time by 80% and our presentations went from forgettable to standing ovations.", name: "Sarah Chen", role: "VP of Marketing, Acme Corp", layout: "center" },
    tags: ["starter", "social-proof"],
  },
  {
    name: "Bold Title Slide",
    block_type: "title",
    description: "Every great presentation starts with a strong opening. Make your first impression count with a clear, bold headline.",
    content: { heading: "Your Bold Headline Here", subheading: "A supporting line that gives context and hooks your audience", layout: "center" },
    tags: ["starter", "opening"],
  },
  {
    name: "Bar Chart Example",
    block_type: "chart",
    description: "Visualize data with a bar chart. Best for showing comparisons, trends over time, or ranking items side by side.",
    content: { heading: "Quarterly Revenue", chartType: "bar", labels: ["Q1", "Q2", "Q3", "Q4"], values: [120, 185, 240, 310], unit: "$K" },
    tags: ["starter", "visualization"],
  },
  {
    name: "Comparison Table",
    block_type: "table",
    description: "Organize detailed information in rows and columns. Perfect for pricing tiers, feature comparisons, or specs.",
    content: { heading: "Plan Comparison", headers: ["Feature", "Free", "Pro", "Enterprise"], rows: [["Users", "1", "10", "Unlimited"], ["Storage", "5 GB", "50 GB", "500 GB"], ["Support", "Email", "Priority", "Dedicated"]] },
    tags: ["starter", "data"],
  },
  {
    name: "Video Embed",
    block_type: "video",
    description: "Embed a YouTube or Loom video directly in your presentation. Great for demos, walkthroughs, or testimonial clips.",
    content: { heading: "Watch the Demo", videoUrl: "", platform: "youtube", description: "Paste a YouTube or Loom URL to embed your video" },
    tags: ["starter", "media"],
  },
  {
    name: "Animated GIF",
    block_type: "gif",
    description: "Add an animated GIF to bring energy, humor, or visual impact to your slide.",
    content: { heading: "Check This Out", gifUrl: "", caption: "Add a GIF URL to display an animation" },
    tags: ["starter", "media", "animation"],
  },
  {
    name: "Lottie Animation",
    block_type: "lottie",
    description: "Embed a Lottie JSON animation for smooth, scalable motion graphics on your slide.",
    content: { heading: "Animation", lottieUrl: "", caption: "Paste a Lottie JSON URL", lottieLoop: true },
    tags: ["starter", "media", "animation"],
  },
  // ─── Educational Starters ───
  {
    name: "Knowledge Check",
    block_type: "quiz",
    description: "Add a multiple-choice question to test understanding. Great after key concepts.",
    content: { heading: "Quick Check", question: "What is the primary benefit of modular content?", questionType: "multiple-choice", options: ["Easier to update", "Looks prettier", "Takes longer to create", "Requires more tools"], correctIndex: 0, explanation: "Modular content can be updated independently, saving time and ensuring consistency." },
    tags: ["starter", "education", "assessment"],
  },
  {
    name: "Learning Objectives",
    block_type: "lesson-objective",
    description: "Start a module by telling learners exactly what they'll gain. Sets expectations and improves focus.",
    content: { heading: "What You'll Learn", objectives: ["Understand the core principles of effective communication", "Apply the 3-step framework to any presentation", "Identify and fix common delivery mistakes"], icon: "🎯" },
    tags: ["starter", "education", "opening"],
  },
  {
    name: "Key Takeaway Card",
    block_type: "key-takeaway",
    description: "Summarize the single most important idea from a section. Helps with retention and recall.",
    content: { heading: "Key Takeaway", takeaway: "The most effective presentations aren't about information — they're about transformation. Start with where your audience is, and end with where you want them to be.", icon: "💡" },
    tags: ["starter", "education", "summary"],
  },
  {
    name: "Practice Exercise",
    block_type: "activity",
    description: "Give learners a hands-on task to apply what they've learned. Active learning beats passive.",
    content: { heading: "Try It Yourself", instructions: "Take your current presentation opening and rewrite it using the 'Hook → Problem → Promise' framework. Share with a partner for feedback.", duration: "10 minutes", activityType: "individual", icon: "✏️" },
    tags: ["starter", "education", "practice"],
  },
  {
    name: "Module Progress",
    block_type: "progress-checkpoint",
    description: "Show learners where they are in the course. Visual progress increases completion rates.",
    content: { heading: "Your Progress", completedModules: ["Introduction", "Core Principles"], currentModule: "Delivery Techniques", upcomingModules: ["Advanced Strategies", "Final Assessment"], progressPercent: 50 },
    tags: ["starter", "education", "navigation"],
  },
  // ─── New Educational Starters ───
  {
    name: "Concept Breakdown",
    block_type: "concept",
    description: "Explain a complex idea clearly with definition, analogy, and example.",
    content: { heading: "Understanding [Concept]", definition: "A clear, one-sentence definition of the concept.", analogy: "Think of it like a postal system — each message has an address and a delivery route.", example: "For instance, when you visit a website, your browser sends a request to a server, which sends back the page.", icon: "🧠" },
    tags: ["starter", "education", "explanation"],
  },
  {
    name: "Fill-in Notes",
    block_type: "guided-notes",
    description: "Structured note-taking prompt with blanks for learners to fill during the lesson.",
    content: { heading: "Guided Notes", prompts: ["The three pillars of effective communication are: _____, _____, and _____.", "The most important factor in audience engagement is _____.", "Key takeaway: _____"], instructions: "Fill in the blanks as we go through this section.", icon: "📝" },
    tags: ["starter", "education", "active-learning"],
  },
  {
    name: "Text Study",
    block_type: "scripture",
    description: "Present a passage with verse reference, commentary, and reflection questions.",
    content: { heading: "Text Study", reference: "Proverbs 16:3", passage: "Commit your work to the Lord, and your plans will be established.", commentary: "This verse reminds us that alignment of purpose precedes success. Before strategising, we ground ourselves in purpose.", reflectionQuestions: ["What does 'commit your work' look like in your daily routine?", "How do you distinguish between your plans and your purpose?"], icon: "📖" },
    tags: ["starter", "education", "scripture"],
  },
  {
    name: "Section Recap",
    block_type: "recap",
    description: "Summarise key points and action items at the end of a section.",
    content: { heading: "Section Recap", keyPoints: ["Modular content increases retention by 40%", "Active learning beats passive consumption", "Progress checkpoints improve completion rates"], actionItems: ["Review your notes from this section", "Complete the practice exercise before moving on"], closingThought: "Remember: the goal isn't to cover content — it's to uncover understanding.", icon: "🔁" },
    tags: ["starter", "education", "summary"],
  },
];
