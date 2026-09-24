/** Journal index. `published: false` stories render as "Coming soon". */
export interface JournalStory {
  id: string;
  kicker: string;
  title: string;
  dek: string;
  minutes: number;
  topic: 'longevity' | 'nutrition' | 'supplements' | 'mind';
  published: boolean;
}

export const JOURNAL: JournalStory[] = [
  {
    id: 'creatine',
    kicker: 'Research brief',
    title: 'Creatine beyond strength',
    dek: 'What the newest trials say about memory, mood and ageing.',
    minutes: 7,
    topic: 'supplements',
    published: true,
  },
  {
    id: 'circadian',
    kicker: 'Protocol',
    title: 'The quiet power of a consistent rhythm',
    dek: 'Why timing can matter as much as the dose.',
    minutes: 6,
    topic: 'longevity',
    published: false,
  },
  {
    id: 'peptides',
    kicker: 'Investigation',
    title: 'Peptides: promise, evidence, and the unknown',
    dek: 'Separating early signal from marketing noise.',
    minutes: 9,
    topic: 'supplements',
    published: false,
  },
];
