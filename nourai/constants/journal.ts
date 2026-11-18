/**
 * The Journal. Every story is written in-house and every factual claim in it
 * traces to one of the story's `sources`. No invented authors, no invented
 * quotes: the byline is the editorial team and the pull line is our own
 * summary, set without quotation marks.
 *
 * A story only belongs here once it is finished. There is no "coming soon".
 */
export type JournalTopic = 'supplements' | 'nutrition' | 'sleep';

export interface JournalSource {
  /** Authors, title, journal, year. Enough to find the paper. */
  citation: string;
  url: string;
}

export interface JournalStory {
  id: string;
  kicker: string;
  title: string;
  dek: string;
  minutes: number;
  topic: JournalTopic;
  /** Month the story was last checked against its sources. */
  reviewed: string;
  takeaways: string[];
  intro: string;
  /** Our own one-line summary, shown large. Not a quotation. */
  standfirst: string;
  body: string[];
  sources: JournalSource[];
  /** Library search that opens the ingredient this story is about, when there is one. */
  ingredientQuery?: string;
}

export const JOURNAL_BYLINE = 'Elory Editorial';

export const JOURNAL_TOPICS: { key: JournalTopic; label: string }[] = [
  { key: 'supplements', label: 'Supplements' },
  { key: 'sleep', label: 'Sleep' },
  { key: 'nutrition', label: 'Nutrition' },
];

export const JOURNAL: JournalStory[] = [
  {
    id: 'creatine',
    kicker: 'Research brief',
    title: 'Creatine beyond strength',
    dek: 'What the trials say about muscle, memory and the kidney myth.',
    minutes: 6,
    topic: 'supplements',
    reviewed: 'November 2026',
    ingredientQuery: 'creatine',
    takeaways: [
      'For strength and power, creatine monohydrate is among the best-supported supplements there is.',
      'Memory benefits look real but small, and clearest in older adults.',
      'In healthy people, studies have not found kidney damage at recommended doses.',
    ],
    intro:
      'Creatine is one of the most studied supplements in sports nutrition, and one of the most misunderstood. Most people file it under bodybuilding. The research describes something broader: a compound your body already makes and stores, which matters wherever cells burn energy quickly, including the brain.',
    standfirst: 'The strongest evidence is for strength. The most interesting evidence is for everything else.',
    body: [
      'The mechanism is simple. Muscle and brain cells store creatine as phosphocreatine, a reserve that rebuilds ATP, the cell’s energy currency, within seconds. Stores are limited, and supplementing raises them. That is why the benefit shows up in short, hard efforts such as lifting, sprinting and repeated bursts, rather than in long steady exercise.',
      'For that kind of effort the evidence is unusually consistent. The International Society of Sports Nutrition’s position stand calls creatine monohydrate the most effective nutritional supplement available for increasing high-intensity exercise capacity and lean mass during training. Across studies, gains in strength and power from short-term use are typically in the range of 5 to 15 percent, on top of what training alone delivers.',
      'The brain is a newer question. A systematic review of randomised trials found that creatine may improve short-term memory and reasoning in healthy people, with mixed results for other mental tasks. A later meta-analysis found a benefit for memory that was clearest in adults aged 66 to 76. These effects are modest, the trials are small, and claims about mood or protection against ageing are still ahead of the evidence.',
      'Dosing is less complicated than the internet suggests. Three to five grams a day is the amount used in most trials. A loading phase of about 20 grams a day for five to seven days fills muscle stores faster, but it is optional: a classic study showed that 3 grams a day reaches the same level in about four weeks. Timing matters far less than taking it consistently.',
      'The kidney worry traces largely to a 1998 case report describing one man who already had kidney disease. Creatine does raise blood creatinine, a marker doctors use to estimate kidney function, which can make a routine test look worse without any damage having occurred. Reviews of the controlled trials have not found harm to kidney function in healthy people at recommended doses. People with existing kidney disease are a different case and should ask their doctor first.',
      'The other things worth knowing are mundane. Early weight gain of a kilogram or two is common and is mostly water held in muscle. And monohydrate is the form nearly all of this research used. No other form has been shown to work better, and most cost more.',
    ],
    sources: [
      {
        citation: 'Kreider RB, et al. International Society of Sports Nutrition position stand: safety and efficacy of creatine supplementation in exercise, sport, and medicine. J Int Soc Sports Nutr. 2017;14:18.',
        url: 'https://pubmed.ncbi.nlm.nih.gov/28615996/',
      },
      {
        citation: 'Avgerinos KI, et al. Effects of creatine supplementation on cognitive function of healthy individuals: a systematic review of randomized controlled trials. Exp Gerontol. 2018;108:166–173.',
        url: 'https://pubmed.ncbi.nlm.nih.gov/29704637/',
      },
      {
        citation: 'Prokopidis K, et al. Effects of creatine supplementation on memory in healthy individuals: a systematic review and meta-analysis of randomized controlled trials. Nutr Rev. 2023;81(4):416–427.',
        url: 'https://pubmed.ncbi.nlm.nih.gov/35984306/',
      },
      {
        citation: 'Hultman E, et al. Muscle creatine loading in men. J Appl Physiol. 1996;81(1):232–237.',
        url: 'https://pubmed.ncbi.nlm.nih.gov/8828669/',
      },
      {
        citation: 'Antonio J, et al. Common questions and misconceptions about creatine supplementation: what does the scientific evidence really show? J Int Soc Sports Nutr. 2021;18:13.',
        url: 'https://pubmed.ncbi.nlm.nih.gov/33557850/',
      },
      {
        citation: 'Pritchard NR, Kalra PA. Renal dysfunction accompanying oral creatine supplements. Lancet. 1998;351(9111):1252–1253.',
        url: 'https://pubmed.ncbi.nlm.nih.gov/9643752/',
      },
    ],
  },
  {
    id: 'magnesium-sleep',
    kicker: 'Belief vs. evidence',
    title: 'Magnesium for sleep: a small effect, loudly sold',
    dek: 'The trials are few and modest. The dose on the label matters more than the form.',
    minutes: 5,
    topic: 'sleep',
    reviewed: 'November 2026',
    ingredientQuery: 'magnesium',
    takeaways: [
      'The best pooled estimate is falling asleep about 17 minutes sooner, from low-quality evidence in older adults.',
      'No trial shows one form, such as glycinate, beating another for sleep.',
      'The upper limit for magnesium from supplements is 350 mg a day. Above it, expect loose stools.',
    ],
    intro:
      'Magnesium has become the default sleep supplement, recommended with a confidence the research does not share. The mineral is essential, many diets fall short of it, and it plays a real role in how nerves and muscles settle. Whether a capsule at bedtime changes your night is a narrower question, and the honest answer is: perhaps a little.',
    standfirst: 'A reasonable thing to try. Not a proven treatment for insomnia.',
    body: [
      'The most cited summary is a 2021 meta-analysis of randomised trials in older adults with insomnia. It could pool only three small trials, 151 people in total. Those taking magnesium fell asleep about 17 minutes sooner than those on placebo. The authors rated the evidence low to very low quality and said it could not support a firm recommendation.',
      'That is the whole picture in miniature: a plausible effect, measured in a handful of small studies, mostly in older people who may have been low in magnesium to begin with. If your intake is already adequate, there is little evidence a supplement adds anything. Studies in younger adults who sleep reasonably well are scarce.',
      'Form is where marketing runs furthest ahead. Glycinate, threonate and other forms are sold as the ones for sleep, but no trial has compared forms head to head for sleep. What is known concerns absorption: forms that dissolve well in liquid, such as citrate, lactate and chloride, are absorbed more completely than magnesium oxide. Oxide is cheap and common, so the number on the front of the label can overstate what you take in.',
      'The limit is clearer than the benefit. The tolerable upper intake level for magnesium from supplements and medicines is 350 mg a day for adults. It does not count magnesium from food. Above it the usual result is diarrhoea and cramps, which is also why some forms are used as laxatives. People with kidney disease clear magnesium poorly and should not supplement without medical advice, and magnesium can interfere with how some antibiotics and osteoporosis medicines are absorbed.',
      'So check the label for elemental magnesium per serving, compare it with 350 mg, and look at what else in your routine already contains it. Multivitamins, electrolyte mixes and sleep blends often overlap. That overlap, not the choice of form, is what most often pushes a routine over the limit.',
    ],
    sources: [
      {
        citation: 'Mah J, Pitre T. Oral magnesium supplementation for insomnia in older adults: a systematic review and meta-analysis. BMC Complement Med Ther. 2021;21:125.',
        url: 'https://pubmed.ncbi.nlm.nih.gov/33865376/',
      },
      {
        citation: 'National Institutes of Health, Office of Dietary Supplements. Magnesium: fact sheet for health professionals.',
        url: 'https://ods.od.nih.gov/factsheets/Magnesium-HealthProfessional/',
      },
    ],
  },
  {
    id: 'ultra-processed',
    kicker: 'Explainer',
    title: 'Ultra-processed: what the label can and cannot tell you',
    dek: 'One careful trial, a great many associations, and a category that is wider than it sounds.',
    minutes: 6,
    topic: 'nutrition',
    reviewed: 'November 2026',
    takeaways: [
      'In a tightly controlled trial, people ate about 500 more calories a day on an ultra-processed diet.',
      'Most other evidence is observational: strong associations, not proof of cause.',
      'The category is broad. Read the processing level alongside the nutrition panel, not in place of it.',
    ],
    intro:
      'When Elory shows a processing level on a food, it is using NOVA, a system that sorts foods into four groups by how they are made rather than by what nutrients they contain. Group 4, ultra-processed, has become shorthand for unhealthy. The research behind that shorthand is stronger than its critics allow and weaker than its headlines suggest.',
    standfirst: 'Processing level is a useful signal. It is not a verdict on its own.',
    body: [
      'NOVA’s groups run from unprocessed or minimally processed foods, through culinary ingredients such as oil and sugar, to processed foods such as cheese and tinned vegetables, and finally to ultra-processed foods: industrial formulations built largely from extracted or refined ingredients plus additives such as flavours, colours and emulsifiers. The definition is about the recipe and the factory, not the calories.',
      'The single best piece of evidence is a 2019 trial run inside a US National Institutes of Health clinic. Twenty adults lived on site for four weeks, spending two weeks on an ultra-processed diet and two on an unprocessed one. The diets were matched for the calories, sugar, fat, fibre and salt presented, and people could eat as much as they liked. On the ultra-processed diet they ate about 500 more calories a day and gained about a kilogram. On the unprocessed diet they lost about the same.',
      'That is a small, short study, but it is a controlled one, and it suggests something about these foods makes it easy to eat more. It does not show which feature is responsible. Speed of eating, energy density and texture are all candidates.',
      'Beyond that trial the evidence is mostly observational. A 2024 umbrella review in the BMJ drew together studies covering nearly ten million people and found that higher intake of ultra-processed food was associated with a higher risk of 32 health outcomes, with the most convincing links to death from cardiovascular disease, type 2 diabetes, and anxiety and other common mental disorders. Associations of that kind cannot rule out other differences between people who eat more or less of these foods.',
      'The fair criticism of NOVA is its breadth. A packaged wholegrain loaf, a flavoured yoghurt and a fizzy drink can all land in group 4, and they are not nutritionally alike. That is why Elory reports processing as one check among several and never folds it into a score. A group 4 food that is low in sugar, salt and saturated fat is a different object from one that is high in all three, and the product page shows you both facts side by side.',
    ],
    sources: [
      {
        citation: 'Monteiro CA, et al. Ultra-processed foods: what they are and how to identify them. Public Health Nutr. 2019;22(5):936–941.',
        url: 'https://pubmed.ncbi.nlm.nih.gov/30744710/',
      },
      {
        citation: 'Hall KD, et al. Ultra-processed diets cause excess calorie intake and weight gain: an inpatient randomized controlled trial of ad libitum food intake. Cell Metab. 2019;30(1):67–77.',
        url: 'https://pubmed.ncbi.nlm.nih.gov/31105044/',
      },
      {
        citation: 'Lane MM, et al. Ultra-processed food exposure and adverse health outcomes: umbrella review of epidemiological meta-analyses. BMJ. 2024;384:e077310.',
        url: 'https://pubmed.ncbi.nlm.nih.gov/38418082/',
      },
    ],
  },
];

export const journalStory = (id?: string | null): JournalStory | undefined => JOURNAL.find((s) => s.id === id);
