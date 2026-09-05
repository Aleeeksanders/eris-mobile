import React, { useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Animated } from 'react-native';
import { wsManager } from '../services/WebSocketManager';
import { T } from '../config/design';

interface Props {
  onOpen: () => void;
  bottomOffset: number;
}

export function ErisFAB({ onOpen, bottomOffset }: Props) {
  const [wsStatus, setWsStatus] = useState<string>('disconnected');
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const pulseRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    const unsub = wsManager.subscribeStatus(s => setWsStatus(s));
    return () => { unsub(); };
  }, []);

  useEffect(() => {
    pulseRef.current?.stop();
    if (wsStatus === 'connected') {
      pulseRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 2200, useNativeDriver: true }),
          Animated.timing(glowAnim, { toValue: 0.2, duration: 2200, useNativeDriver: true }),
        ])
      );
      pulseRef.current.start();
    } else {
      glowAnim.setValue(0);
    }
    return () => { pulseRef.current?.stop(); };
  }, [wsStatus]);

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.88, duration: 70, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, tension: 160, friction: 5, useNativeDriver: true }),
    ]).start();
    onOpen();
  };

  const dotColor = wsStatus === 'connected' ? T.green : wsStatus === 'connecting' ? T.gold : '#4b5563';

  return (
    <Animated.View style={[s.wrap, { bottom: bottomOffset, transform: [{ scale: scaleAnim }] }]}>
      {/* Glow ring pulsante */}
      <Animated.View
        style={[
          s.glow,
          {
            opacity: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.28] }),
            transform: [{ scale: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) }],
          },
        ]}
      />
      <TouchableOpacity style={s.btn} onPress={handlePress} activeOpacity={0.82}>
        <Text style={s.icon}>⚡</Text>
      </TouchableOpacity>
      <View style={[s.dot, { backgroundColor: dotColor }]} />
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 20,
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: T.accent,
  },
  btn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: T.bgCard,
    borderWidth: 1.5,
    borderColor: T.borderActive,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: T.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 10,
  },
  icon: { fontSize: 22 },
  dot: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    borderWidth: 1.5,
    borderColor: T.bgCard,
  },
});
