import React, { useState } from 'react';
import { Pressable } from 'react-native';
import { Txt, type TxtProps } from './Txt';

/**
 * Long text shown as a few lines with "Read more". The full text is one tap
 * away; nothing is cut from what the reader can reach.
 */
export function ClampedText({ lines = 3, children, ...rest }: TxtProps & { lines?: number; children: string }) {
  const [expanded, setExpanded] = useState(false);
  // ~55 characters fit a line at these sizes; beyond `lines` of them, offer more.
  const overflows = children.length > lines * 55;
  return (
    <>
      <Txt
        {...rest}
        numberOfLines={expanded ? undefined : lines}
      >
        {children}
      </Txt>
      {overflows ? (
        <Pressable onPress={() => setExpanded((v) => !v)} hitSlop={8} accessibilityRole="button" style={{ marginTop: 8, alignSelf: 'flex-start' }}>
          <Txt variant="subheadStrong" tone="accent">{expanded ? 'Show less' : 'Read more'}</Txt>
        </Pressable>
      ) : null}
    </>
  );
}
