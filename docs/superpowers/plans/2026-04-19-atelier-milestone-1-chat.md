# Atelier Milestone 1: Ask Elory Chat Persistence — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist Ask Elory chat messages to a `chat_messages` table so conversations survive app restarts, and expose GET/DELETE history endpoints.

**Architecture:** New `ChatMessage` SQLAlchemy model + migration 010. Extend existing `POST /chat/message` to persist both turns after Claude replies. Add `GET /chat/history` and `DELETE /chat/history` endpoints in the existing `app/api/v1/chat.py`. Frontend loads history on mount and clears it with a new-conversation button.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 async, PostgreSQL, Alembic, Expo / React Native, TypeScript

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `backend-nourai/app/models/chat_message.py` | `ChatMessage` ORM model |
| Modify | `backend-nourai/app/models/__init__.py` | Export `ChatMessage` |
| Create | `backend-nourai/alembic/versions/010_chat_messages.py` | DB migration |
| Modify | `backend-nourai/app/schemas/chat.py` | Add `ChatMessageResponse`, `ChatHistoryResponse` |
| Modify | `backend-nourai/app/api/v1/chat.py` | Add history/delete endpoints; persist turns in POST |
| Modify | `nourai/services/api.ts` | Add `getChatHistory`, `deleteChatHistory`, `sendChatMessage` |
| Modify | `nourai/app/(premium)/ask-elory.tsx` | Load history on mount; new-conversation button |

---

### Task 1: ChatMessage model

**Files:**
- Create: `backend-nourai/app/models/chat_message.py`
- Modify: `backend-nourai/app/models/__init__.py`

- [ ] **Step 1: Create the model file**

```python
# backend-nourai/app/models/chat_message.py
"""ChatMessage model — one row per turn in a user's Ask Elory conversation."""
from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.user import UserProfile


class ChatMessage(Base, UUIDMixin, TimestampMixin):
    """One row = one turn (user or assistant) in the rolling conversation."""

    __tablename__ = "chat_messages"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("user_profiles.id", ondelete="CASCADE"),
        nullable=False,
    )
    role: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # "user" or "assistant"
    content: Mapped[str] = mapped_column(Text, nullable=False)

    user: Mapped["UserProfile"] = relationship("UserProfile", back_populates="chat_messages")

    __table_args__ = (
        Index("ix_chat_messages_user_created", "user_id", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<ChatMessage user={self.user_id} role={self.role}>"
```

- [ ] **Step 2: Add `chat_messages` back-reference to UserProfile**

Open `backend-nourai/app/models/user.py`. Find the `UserProfile` class. Add the relationship after the existing `subscription` relationship:

```python
# Add this import at the top of the TYPE_CHECKING block
from app.models.chat_message import ChatMessage

# Add inside UserProfile class, after `subscription`:
chat_messages: Mapped[list["ChatMessage"]] = relationship(
    "ChatMessage",
    back_populates="user",
    cascade="all, delete-orphan",
    order_by="ChatMessage.created_at",
)
```

- [ ] **Step 3: Export ChatMessage from `__init__.py`**

Open `backend-nourai/app/models/__init__.py`. Add the import and export:

```python
# Add to imports (after UnmatchedIngredientLog line):
from app.models.chat_message import ChatMessage  # noqa: F401

# Add to __all__:
"ChatMessage",
```

- [ ] **Step 4: Commit**

```bash
cd /Users/redar/Desktop/nourai
git add backend-nourai/app/models/chat_message.py backend-nourai/app/models/__init__.py backend-nourai/app/models/user.py
git commit -m "feat: add ChatMessage model"
```

---

### Task 2: Migration 010

**Files:**
- Create: `backend-nourai/alembic/versions/010_chat_messages.py`

- [ ] **Step 1: Create the migration file**

```python
# backend-nourai/alembic/versions/010_chat_messages.py
"""Add chat_messages table.

Revision ID: 010
Revises: 009
Create Date: 2026-04-19
"""
from alembic import op
import sqlalchemy as sa

revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "chat_messages",
        sa.Column(
            "id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("user_profiles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
    )
    op.create_index(
        "ix_chat_messages_user_created",
        "chat_messages",
        ["user_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_chat_messages_user_created", table_name="chat_messages")
    op.drop_table("chat_messages")
```

- [ ] **Step 2: Run the migration**

```bash
cd /Users/redar/Desktop/nourai/backend-nourai
source venv/bin/activate
alembic upgrade head
```

Expected: `Running upgrade 009 -> 010, Add chat_messages table`

- [ ] **Step 3: Commit**

```bash
cd /Users/redar/Desktop/nourai
git add backend-nourai/alembic/versions/010_chat_messages.py
git commit -m "feat: migration 010 — chat_messages table"
```

---

### Task 3: Chat schemas

**Files:**
- Modify: `backend-nourai/app/schemas/chat.py`

- [ ] **Step 1: Read the current schemas file**

```bash
cat backend-nourai/app/schemas/chat.py
```

- [ ] **Step 2: Add `ChatMessageResponse` and `ChatHistoryResponse`**

Append to the bottom of `backend-nourai/app/schemas/chat.py`:

```python
from datetime import datetime
from uuid import UUID


class ChatMessageResponse(BaseModel):
    id: UUID
    role: str
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatHistoryResponse(BaseModel):
    messages: list[ChatMessageResponse]
    total: int
```

- [ ] **Step 3: Commit**

```bash
cd /Users/redar/Desktop/nourai
git add backend-nourai/app/schemas/chat.py
git commit -m "feat: add ChatMessageResponse and ChatHistoryResponse schemas"
```

---

### Task 4: Chat API endpoints

**Files:**
- Modify: `backend-nourai/app/api/v1/chat.py`

- [ ] **Step 1: Add imports to chat.py**

At the top of `backend-nourai/app/api/v1/chat.py`, add these imports after the existing ones:

```python
from datetime import datetime, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, DBSession
from app.models.chat_message import ChatMessage
from app.schemas.chat import ChatHistoryResponse, ChatMessageResponse
```

- [ ] **Step 2: Add GET /history endpoint**

Append inside `backend-nourai/app/api/v1/chat.py` (before the `POST /message` handler):

```python
@router.get("/history", response_model=ChatHistoryResponse)
async def get_chat_history(
    db: DBSession,
    current_user: CurrentUser,
    limit: int = 50,
    offset: int = 0,
) -> ChatHistoryResponse:
    """Return paginated chat history for the current user, oldest-first."""
    total_result = await db.execute(
        select(func.count()).where(ChatMessage.user_id == current_user.id)
    )
    total = total_result.scalar_one()

    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.user_id == current_user.id)
        .order_by(ChatMessage.created_at.asc())
        .limit(limit)
        .offset(offset)
    )
    messages = result.scalars().all()

    return ChatHistoryResponse(
        messages=[ChatMessageResponse.model_validate(m) for m in messages],
        total=total,
    )
```

- [ ] **Step 3: Add DELETE /history endpoint**

Append after the GET handler:

```python
@router.delete("/history", status_code=204)
async def clear_chat_history(
    db: DBSession,
    current_user: CurrentUser,
) -> None:
    """Hard-delete all chat messages for the current user."""
    await db.execute(
        delete(ChatMessage).where(ChatMessage.user_id == current_user.id)
    )
    await db.commit()
```

- [ ] **Step 4: Extend POST /message to persist turns**

Replace the existing `chat_message` handler's return statement:

```python
# Replace this:
return ChatResponse(message=reply)

# With this:
# Persist both turns — best-effort, never blocks the user
try:
    db.add(ChatMessage(user_id=current_user.id, role="user", content=request.messages[-1].content))
    db.add(ChatMessage(user_id=current_user.id, role="assistant", content=reply))
    await db.commit()
except Exception:
    await db.rollback()  # Non-fatal

return ChatResponse(message=reply)
```

Also update the handler signature to accept `db` and `current_user`:

```python
@router.post("/message", response_model=ChatResponse)
async def chat_message(
    request: ChatRequest,
    db: DBSession,
    current_user: CurrentUser,
) -> ChatResponse:
```

- [ ] **Step 5: Verify the server starts**

```bash
cd /Users/redar/Desktop/nourai/backend-nourai
source venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

Expected: Server starts with no import errors. Visit `http://localhost:8000/docs` — should see `GET /api/v1/chat/history` and `DELETE /api/v1/chat/history` listed.

- [ ] **Step 6: Commit**

```bash
cd /Users/redar/Desktop/nourai
git add backend-nourai/app/api/v1/chat.py
git commit -m "feat: chat history endpoints + persist turns in POST /message"
```

---

### Task 5: Frontend — api.ts

**Files:**
- Modify: `nourai/services/api.ts`

- [ ] **Step 1: Add TypeScript types**

Find the types section near the top of `nourai/services/api.ts` and add:

```typescript
export interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface ChatHistoryResponse {
  messages: ChatMessageItem[];
  total: number;
}
```

- [ ] **Step 2: Add API methods**

Find the `ApiClient` class in `nourai/services/api.ts` and add these methods after the existing `chat` method (or after `removeFromStack`):

```typescript
async getChatHistory(authToken: string, limit = 50, offset = 0): Promise<ChatHistoryResponse> {
  return this.fetch<ChatHistoryResponse>(
    `/chat/history?limit=${limit}&offset=${offset}`,
    { headers: { Authorization: `Bearer ${authToken}` } },
  );
}

async deleteChatHistory(authToken: string): Promise<void> {
  await this.fetch<void>('/chat/history', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${authToken}` },
  });
}

async sendChatMessage(
  authToken: string,
  messages: { role: string; content: string }[],
  stackContext: Record<string, unknown>,
): Promise<{ message: string }> {
  return this.fetch<{ message: string }>('/chat/message', {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ messages, stack_context: stackContext }),
  });
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/redar/Desktop/nourai
git add nourai/services/api.ts
git commit -m "feat: chat API methods in api.ts"
```

---

### Task 6: Frontend — ask-elory.tsx

**Files:**
- Modify: `nourai/app/(premium)/ask-elory.tsx`

- [ ] **Step 1: Replace the screen with the wired version**

Replace the entire contents of `nourai/app/(premium)/ask-elory.tsx`:

```tsx
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInUp } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { supabase } from '@/lib/supabase';
import { api } from '@/services/api';
import { Colors, Fonts, FontSizes, scale, Radius } from '@/constants/theme';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const PROMPTS = [
  'Why did my sleep score drop this week?',
  'Can I take ashwagandha with SSRIs?',
  'Walk me through my current stack synergies.',
];

export default function AskEloryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadHistory();
  }, []);

  async function getToken(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function loadHistory() {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await api.getChatHistory(token, 50, 0);
      setMessages(res.messages.map(m => ({ id: m.id, role: m.role as 'user' | 'assistant', content: m.content })));
    } catch {
      // Non-fatal — show empty state
    } finally {
      setLoading(false);
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setSending(true);

    try {
      const token = await getToken();
      if (!token) return;
      const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));
      const res = await api.sendChatMessage(token, history, { products: [], domain_scores: {}, goals: [] });
      const assistantMsg: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: res.message };
      setMessages(prev => [...prev, assistantMsg]);
    } catch {
      // Remove the optimistic user message on failure
      setMessages(prev => prev.filter(m => m.id !== userMsg.id));
      setInput(text);
    } finally {
      setSending(false);
    }
  }

  async function handleNewConversation() {
    try {
      const token = await getToken();
      if (!token) return;
      await api.deleteChatHistory(token);
      setMessages([]);
    } catch {
      // Non-fatal
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={{ paddingTop: insets.top + scale(12), paddingHorizontal: scale(24), paddingBottom: scale(20) }}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="rgba(241,237,228,0.6)" strokeWidth={2}>
              <Path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Pressable onPress={handleNewConversation}>
              <Text style={styles.newConvoBtn}>New</Text>
            </Pressable>
            <View style={styles.atelierBadge}>
              <Text style={styles.atelierBadgeText}>◆ Atelier</Text>
            </View>
          </View>
        </View>
        <Text style={styles.eyebrow}>Premium · Conversational</Text>
        <Text style={styles.title}>Ask Elory.</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + scale(100) }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {loading && (
          <ActivityIndicator color={Colors.sand} style={{ marginVertical: scale(24) }} />
        )}

        {/* Suggested prompts — only when no history */}
        {!loading && messages.length === 0 && (
          <Animated.View entering={FadeInUp.duration(320)} style={{ gap: scale(8), marginBottom: scale(24) }}>
            {PROMPTS.map((p, i) => (
              <Pressable key={i} style={styles.promptCard} onPress={() => setInput(p)}>
                <Text style={styles.promptText}>— {p}</Text>
              </Pressable>
            ))}
          </Animated.View>
        )}

        {/* Message thread */}
        {messages.map((msg, i) =>
          msg.role === 'user' ? (
            <Animated.View key={msg.id} entering={FadeInUp.duration(200)}>
              <Text style={styles.msgTimestamp}>You</Text>
              <Text style={styles.userMsg}>{msg.content}</Text>
              <View style={styles.msgDivider} />
            </Animated.View>
          ) : (
            <Animated.View key={msg.id} entering={FadeInUp.duration(200)} style={{ gap: scale(10), marginBottom: scale(20) }}>
              <View style={styles.eloryMeta}>
                <View style={styles.eloryAvatar}>
                  <Text style={styles.eloryAvatarText}>E</Text>
                </View>
                <Text style={styles.eloryLabel}>Elory</Text>
              </View>
              <Text style={styles.eloryText}>{msg.content}</Text>
            </Animated.View>
          )
        )}

        {sending && (
          <View style={styles.eloryMeta}>
            <View style={styles.eloryAvatar}>
              <Text style={styles.eloryAvatarText}>E</Text>
            </View>
            <ActivityIndicator size="small" color={Colors.sand} />
          </View>
        )}
      </ScrollView>

      {/* Input bar */}
      <View style={[styles.inputBar, { paddingBottom: insets.bottom + scale(12) }]}>
        <View style={styles.inputPill}>
          <TextInput
            style={styles.input}
            placeholder="Ask about your stack…"
            placeholderTextColor="rgba(241,237,228,0.3)"
            value={input}
            onChangeText={setInput}
            multiline
            onSubmitEditing={handleSend}
          />
          <Pressable style={[styles.sendBtn, sending && { opacity: 0.5 }]} onPress={handleSend}>
            <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={Colors.darkSurface} strokeWidth={2}>
              <Path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.darkSurface },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: scale(24) },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backText: { fontFamily: Fonts.sansSemiBold, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(241,237,228,0.6)' },
  newConvoBtn: { fontFamily: Fonts.sansSemiBold, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(241,237,228,0.4)' },
  atelierBadge: { paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(241,237,228,0.22)', borderRadius: 999 },
  atelierBadgeText: { fontFamily: Fonts.sansSemiBold, fontSize: 9, letterSpacing: 1.8, textTransform: 'uppercase', color: Colors.sand },
  eyebrow: { fontFamily: Fonts.sansSemiBold, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.4, color: 'rgba(241,237,228,0.45)', marginBottom: scale(10) },
  title: { fontFamily: Fonts.serifItalic, fontSize: scale(40), lineHeight: scale(42), color: Colors.darkInk, letterSpacing: -0.5 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: scale(24), paddingTop: scale(4) },
  promptCard: { padding: scale(14), borderWidth: 1, borderColor: 'rgba(241,237,228,0.1)', borderRadius: Radius.md },
  promptText: { fontFamily: Fonts.serifItalic, fontSize: FontSizes.subtitle, color: 'rgba(241,237,228,0.8)', lineHeight: FontSizes.subtitle * 1.4 },
  msgTimestamp: { fontFamily: Fonts.sansSemiBold, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.4, color: 'rgba(241,237,228,0.4)', marginBottom: scale(8) },
  userMsg: { fontFamily: Fonts.serif, fontSize: FontSizes.title, lineHeight: FontSizes.title * 1.4, color: Colors.darkInk, paddingBottom: scale(16) },
  msgDivider: { height: 1, backgroundColor: 'rgba(241,237,228,0.1)', marginBottom: scale(20) },
  eloryMeta: { flexDirection: 'row', alignItems: 'center', gap: scale(8), marginBottom: scale(8) },
  eloryAvatar: { width: scale(22), height: scale(22), borderRadius: 999, backgroundColor: Colors.sand, alignItems: 'center', justifyContent: 'center' },
  eloryAvatarText: { fontFamily: Fonts.serifItalic, fontSize: 12, color: Colors.darkSurface },
  eloryLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.4, color: 'rgba(241,237,228,0.4)' },
  eloryText: { fontFamily: Fonts.serif, fontSize: FontSizes.title, lineHeight: FontSizes.title * 1.5, color: Colors.darkInk, marginBottom: scale(20) },
  inputBar: { paddingHorizontal: scale(16), paddingTop: scale(8) },
  inputPill: { flexDirection: 'row', alignItems: 'center', gap: scale(8), paddingLeft: scale(20), paddingRight: scale(6), paddingVertical: scale(6), borderRadius: 999, backgroundColor: 'rgba(241,237,228,0.08)', borderWidth: 1, borderColor: 'rgba(241,237,228,0.12)' },
  input: { flex: 1, fontFamily: Fonts.sans, fontSize: FontSizes.body, color: Colors.darkInk, maxHeight: scale(80), paddingVertical: scale(6) },
  sendBtn: { width: scale(36), height: scale(36), borderRadius: 999, backgroundColor: Colors.sand, alignItems: 'center', justifyContent: 'center' },
});
```

- [ ] **Step 2: Test on simulator**

Open the Atelier tab → Ask Elory. Verify:
- Suggested prompts appear when history is empty
- Tapping a prompt populates the input field
- Sending a message shows the user message immediately, then the Elory reply
- Pressing "New" clears the thread
- Reopening the screen reloads the saved history

- [ ] **Step 3: Commit**

```bash
cd /Users/redar/Desktop/nourai
git add nourai/app/\(premium\)/ask-elory.tsx
git commit -m "feat: wire Ask Elory to persistent chat history API"
```
