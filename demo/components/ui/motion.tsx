'use client';

import {
  AnimatePresence,
  MotionConfig,
  type Transition,
  motion,
  useReducedMotion,
} from 'motion/react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

const REDUCED_MOTION_TRANSITION = { duration: 0 } satisfies Transition;

export const uiMotionTransition = {
  type: 'spring',
  stiffness: 520,
  damping: 42,
  mass: 0.7,
} satisfies Transition;

export const uiMotionQuickTransition = {
  type: 'spring',
  stiffness: 700,
  damping: 52,
  mass: 0.5,
} satisfies Transition;

export const uiMotionHeightTransition = {
  type: 'spring',
  stiffness: 460,
  damping: 44,
  mass: 0.72,
} satisfies Transition;

export const uiMotionPressProps = {
  transition: uiMotionQuickTransition,
  whileTap: { scale: 0.985 },
} as const;

export const uiMotionPopupProps = {
  animate: { opacity: 1, scale: 1, y: 0 },
  initial: { opacity: 0, scale: 0.985, y: -2 },
  transition: uiMotionQuickTransition,
} as const;

export function useReducedMotionTransition(transition: Transition): Transition {
  return useReducedMotion() ? REDUCED_MOTION_TRANSITION : transition;
}

export function T3MotionProvider({ children }: { readonly children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={uiMotionTransition}>
      {children}
    </MotionConfig>
  );
}

export function MotionHeightPresence({
  children,
  className,
  innerClassName,
  visible,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly innerClassName?: string;
  readonly visible: boolean;
}) {
  const transition = useReducedMotionTransition(uiMotionHeightTransition);

  return (
    <AnimatePresence initial={false}>
      {visible ? (
        <motion.div
          animate={{ height: 'auto', opacity: 1 }}
          className={cn('overflow-hidden', className)}
          exit={{ height: 0, opacity: 0 }}
          initial={{ height: 0, opacity: 0 }}
          transition={transition}
        >
          <div className={innerClassName}>{children}</div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function MotionTextSwap({
  className,
  text,
  textClassName,
  truncate = true,
}: {
  readonly className?: string;
  readonly text: string;
  readonly textClassName?: string;
  readonly truncate?: boolean;
}) {
  const transition = useReducedMotionTransition(uiMotionQuickTransition);

  return (
    <span className={cn('relative inline-grid min-w-0', className)}>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={text}
          animate={{ opacity: 1, y: 0 }}
          className={cn('col-start-1 row-start-1 min-w-0', truncate && 'truncate', textClassName)}
          exit={{ opacity: 0, y: -4 }}
          initial={{ opacity: 0, y: 4 }}
          transition={transition}
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export { AnimatePresence, motion };
