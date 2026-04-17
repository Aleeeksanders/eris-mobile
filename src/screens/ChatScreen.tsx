import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { wsManager } from '../services/WebSocketManager';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  isComplete: boolean;
}

export default function ChatScreen() {
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<string>('disconnected');
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    // Suscribirse a estado de conexión
    const unsubStatus = wsManager.subscribeStatus((st) => setStatus(st));
    
    // Suscribirse a los mensajes del backend WebSocket de Eris
    const unsubMsg = wsManager.subscribeMessage((payload) => {
      if (payload.type === 'connected' || payload.type === 'chat_switched') {
        if (payload.history) {
          const loaded = payload.history.map((m: any) => ({
            id: m.id || Math.random().toString(),
            role: m.role,
            content: m.content,
            isComplete: true
          }));
          setMessages(loaded);
        }
      } else if (payload.type === 'token') {
        setMessages((prev) => {
          let updated = [...prev];
          let lastMsg = updated[updated.length - 1];
          if (!lastMsg || lastMsg.role !== 'assistant' || lastMsg.isComplete) {
            lastMsg = { id: Math.random().toString(), role: 'assistant', content: payload.content, isComplete: false };
            updated.push(lastMsg);
          } else {
            lastMsg.content += payload.content;
          }
          return updated;
        });
      } else if (payload.type === 'thinking_token') {
        setMessages((prev) => {
          let updated = [...prev];
          let lastMsg = updated[updated.length - 1];
          if (!lastMsg || lastMsg.role !== 'assistant' || lastMsg.isComplete) {
            lastMsg = { id: Math.random().toString(), role: 'assistant', content: '', thinking: payload.content, isComplete: false };
            updated.push(lastMsg);
          } else {
            lastMsg.thinking = (lastMsg.thinking || '') + payload.content;
          }
          return updated;
        });
      } else if (payload.type === 'tool_call') {
        setMessages((prev) => {
          let updated = [...prev];
          let lastMsg = updated[updated.length - 1];
          const toolText = `\n🔧 [Herramienta: ${payload.name}...]`;
          if (!lastMsg || lastMsg.role !== 'assistant' || lastMsg.isComplete) {
            updated.push({ id: Math.random().toString(), role: 'assistant', content: toolText, isComplete: false });
          } else {
            lastMsg.content += toolText;
          }
          return updated;
        });
      } else if (payload.type === 'stream_end' || payload.type === 'done') {
        setMessages((prev) => {
           const updated = [...prev];
           const lastMsg = updated[updated.length - 1];
           if (lastMsg) lastMsg.isComplete = true;
           return updated;
        });
      }
    });

    // Iniciar conexión WS al montar
    wsManager.connect();

    return () => {
      unsubStatus();
      unsubMsg();
    };
  }, []);

  const sendMessage = () => {
    if (!inputText.trim()) return;
    
    const newMsg: ChatMessage = { id: Math.random().toString(), role: 'user', content: inputText.trim(), isComplete: true };
    setMessages((prev) => [...prev, newMsg]);
    
    wsManager.sendMessage({ type: 'message', content: inputText.trim() });
    setInputText('');
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <View style={styles.statusBanner}>
        <Text style={styles.statusText}>
          {status === 'connected' ? '🟢 Conectado' : status === 'connecting' ? '🟡 Conectando...' : '🔴 Offline (Fallback)'}
        </Text>
      </View>

      <ScrollView 
        ref={scrollViewRef}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
        contentContainerStyle={styles.chatContainer}
      >
        {messages.map((msg, index) => (
          <View key={index} style={[styles.messageBubble, msg.role === 'user' ? styles.userBubble : styles.botBubble]}>
            <Text style={styles.roleText}>{msg.role === 'user' ? 'TÚ' : 'ERIS'}</Text>
            
            {msg.thinking ? (
              <View style={styles.thinkingContainer}>
                <Text style={styles.thinkingTitle}>⚡ Pensamiento analítico</Text>
                <Text style={styles.thinkingText}>{msg.thinking}</Text>
              </View>
            ) : null}

            {msg.content ? (
              <Text style={styles.contentText}>{msg.content}</Text>
            ) : null}
          </View>
        ))}
      </ScrollView>

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Habla con Eris..."
          placeholderTextColor="#a6adc8"
          value={inputText}
          onChangeText={setInputText}
          multiline
        />
        <TouchableOpacity style={styles.sendButton} onPress={sendMessage}>
          <Text style={styles.sendButtonText}>Enviar</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e1e2e',
  },
  statusBanner: {
    padding: 8,
    backgroundColor: '#11111b',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: '#313244'
  },
  statusText: {
    color: '#a6adc8',
    fontSize: 12,
    fontWeight: 'bold',
  },
  chatContainer: {
    padding: 16,
    paddingBottom: 24,
  },
  messageBubble: {
    marginBottom: 16,
    padding: 14,
    borderRadius: 12,
    maxWidth: '90%',
  },
  userBubble: {
    backgroundColor: '#89b4fa',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 2,
  },
  botBubble: {
    backgroundColor: '#313244',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 2,
  },
  roleText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 6,
  },
  thinkingContainer: {
    backgroundColor: '#1e1e2e',
    padding: 10,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#f9e2af',
    marginBottom: 8,
  },
  thinkingTitle: {
    color: '#f9e2af',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  thinkingText: {
    color: '#cdd6f4',
    fontSize: 13,
    fontStyle: 'italic',
  },
  contentText: {
    color: '#11111b',
    fontSize: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#181825',
    borderTopWidth: 1,
    borderColor: '#313244',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: '#313244',
    color: '#cdd6f4',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxHeight: 100,
    fontSize: 16,
  },
  sendButton: {
    backgroundColor: '#cba6f7',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 20,
    marginLeft: 10,
    justifyContent: 'center',
  },
  sendButtonText: {
    color: '#11111b',
    fontWeight: 'bold',
    fontSize: 14,
  }
});
