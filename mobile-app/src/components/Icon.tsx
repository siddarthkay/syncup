import React from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from './ui';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

interface Props {
  name: IoniconsName;
  size?: number;
  color?: string;
}

export function Icon({ name, size = 20, color = colors.text }: Props) {
  return <Ionicons name={name} size={size} color={color} />;
}

export type { IoniconsName };
