import { type Variants, type Transition, type TargetAndTransition } from 'framer-motion';

// Refined Spring Tokens inspired by Linear & Apple interfaces
export const springs = {
  tactile: {
    type: 'spring',
    stiffness: 450,
    damping: 25,
  } as Transition,
  gentle: {
    type: 'spring',
    stiffness: 300,
    damping: 30,
  } as Transition,
  elastic: {
    type: 'spring',
    stiffness: 350,
    damping: 22,
  } as Transition,
  layout: {
    type: 'spring',
    stiffness: 320,
    damping: 32,
  } as Transition,
};

// Subtle Card Hover with proper Framer Motion TargetAndTransition typing
export const cardHoverProps = {
  whileHover: {
    y: -2,
    transition: {
      duration: 0.2,
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    },
  } as TargetAndTransition,
};

// Tactile Button Press
export const buttonTapProps = {
  whileTap: {
    scale: 0.96,
    transition: springs.tactile,
  },
  whileHover: {
    scale: 1.01,
    transition: { duration: 0.15 },
  },
};

// Staggered Page Mount Cascade
export const pageContainerVariants: Variants = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.02,
    },
  },
};

// Page Item Entrance
export const itemEntranceVariants: Variants = {
  hidden: {
    opacity: 1,
    y: 0,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    },
  },
};

// Breathing Animation for Focus Instruments
export const breathingAnimation = {
  scale: [1, 1.008, 1],
  transition: {
    duration: 4.5,
    repeat: Infinity,
    ease: 'easeInOut',
  },
};
