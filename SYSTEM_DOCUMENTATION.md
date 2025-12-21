# 🎨 Rupantar AI - Complete Backend System

## 📋 **System Overview**

Complete AI image generation backend with modular provider system and advanced safety controls.

---

## 🔧 **Core Components**

### **1. Modular AI Provider System**
Location: `/providers/`

All providers follow the same interface for easy maintenance:

#### **Available Providers:**
- ✅ **Stability AI** - SDXL 1.0 (multipart/form-data)
- ✅ **MiniMax Official** - Image-01 with async polling
- ✅ **Replicate** - Multi-model support (Flux, SDXL, etc.)
- ✅ **OpenAI** - DALL-E 3
- ✅ **Google Gemini** - Gemini 2.5 Flash Image

#### **Provider Interface:**
```javascript
async function generateWith[Provider]({ 
  prompt, 
  negativePrompt, 
  uploadedImages, 
  apiKey, 
  modelConfig 
}) {
  // T2I or I2I logic
  return imageUrl;
}
```

---

### **2. AI Guard System & Safety Rules**
Location: `/services/aiGuardService.js`

**Purpose:** Merge User Prompt + Template Prompt + Hidden Guard Rules

#### **Prompt Flow:**
```
User Input: "luxury car"
↓
Template: "Professional photo of {prompt}"
↓
Guard Rules Applied:
  - NSFW Safety (Priority 0)
  - Face Preservation (Priority 1)
  - Negative Prompts (Priority 2)
  - Quality Control (Priority 3)
↓
Final Execution Prompt: "Safe family-friendly content. Preserve exact
facial features. 4K photorealistic. Professional photo of luxury car"
↓
Sent to AI Provider
```

#### **Default Rules:**

| Rule Name | Type | Priority | Applied To |
|-----------|------|----------|------------|
| NSFW & Safety Block | safety_nsfw | 0 | All |
| Face Preservation | face_preserve | 1 | I2I only |
| Global Negative Prompt | negative_prompt | 2 | All |
| Quality Enhancement | quality_control | 3 | All |

---

### **3. AI Router Service**
Location: `/services/aiRouter.js`

**Purpose:** Central routing and orchestration

**Flow:**
1. Get active AI from database
2. Apply AI Guard System (merge prompts)
3. Route to correct provider
4. Update statistics
5. Return result with clean prompt for DB

---

## 📡 **API Endpoints**

### **Core Generation API:**
```
POST /api/generation/generate
Body: {
  prompt: "user prompt",
  templatePrompt: "template with {prompt}",
  referenceImages: ["url1", "url2"],
  aspectRatio: "1:1",
  quality: "HD",
  negativePrompt: "optional"
}
```

### **AI Guard Management API:**

#### **Get All Rules:**
```
GET /api/admin/guard-rules
Response: Array of guard rules with priority
```

#### **Create Rule:**
```
POST /api/admin/guard-rules
Body: {
  ruleName: "My Rule",
  ruleType: "quality_control",
  enabled: true,
  priority: 5,
  hiddenPrompt: "System instruction here",
  applyTo: ["image_to_image", "text_to_image"]
}
```

#### **Update Rule:**
```
PUT /api/admin/guard-rules/:id
Body: { ...updated fields }
```

#### **Delete Rule:**
```
DELETE /api/admin/guard-rules/:id
```

#### **Seed Default Rules:**
```
POST /api/admin/guard-rules/seed
Response: Creates 4 default safety rules
```

---

## 🗄️ **Database Models**

### **GenerationGuardRule Schema:**
```javascript
{
  ruleName: String,
  ruleType: 'face_preserve' | 'safety_nsfw' | 'negative_prompt' | 'quality_control' | 'custom',
  enabled: Boolean,
  priority: Number,  // Lower = higher priority
  hiddenPrompt: String,  // Never exposed to users
  applyTo: ['image', 'image_to_image', 'text_to_image'],
  createdAt: Date,
  updatedAt: Date
}
```

### **AIModel Schema:**
```javascript
{
  name: String,
  key: 'gemini' | 'minimax' | 'stability' | 'openai' | 'replicate',
  provider: String,
  active: Boolean,
  config: {
    apiKey: String,
    model: String
  },
  stats: {
    totalGenerations: Number,
    successRate: Number,
    averageTime: Number
  }
}
```

---

## 🚀 **Deployment Guide**

### **1. Environment Variables:**
```env
# Database
MONGODB_URI=mongodb://...

# AI Provider API Keys
GEMINI_API_KEY=your_key
MINIMAX_API_KEY=your_key
STABILITY_API_KEY=your_key
OPENAI_API_KEY=your_key
REPLICATE_API_KEY=your_key

# Server
PORT=5000
NODE_ENV=production
```

### **2. Install Dependencies:**
```bash
npm install
```

**Key Dependencies:**
- `form-data@4.0.0` - For Stability multipart
- `mongoose` - Database
- `express` - Web server

### **3. Start Server:**
```bash
# Development
npm run dev

# Production
npm start

# PM2 (Recommended)
pm2 start server.full.js --name rupantar-backend
pm2 save
```

---

## 📊 **Provider Comparison**

| Provider | Quality | Speed | Cost | Face Preservation | Best For |
|----------|---------|-------|------|-------------------|----------|
| **Gemini** | ⭐⭐⭐⭐⭐ | ⚡ Fast | 💰 Free Tier | ⭐⭐⭐⭐ | Testing, Free tier |
| **MiniMax** | ⭐⭐⭐⭐ | Fast | Low | ⭐⭐⭐⭐⭐ | **Production** ⭐ |
| **Replicate** | ⭐⭐⭐⭐⭐ | Fast | Medium | ⭐⭐⭐⭐⭐ | High quality |
| **Stability** | ⭐⭐⭐⭐⭐ | Medium | Medium | ⭐⭐⭐⭐ | SDXL quality |
| **OpenAI** | ⭐⭐⭐⭐ | Fast | High | ⭐⭐⭐ | General use |

---

## 🔒 **Security Features**

### **AI Guard System:**
✅ Hidden prompts NEVER exposed to users
✅ Saved to DB separately from execution prompt
✅ NSFW content blocking
✅ Face preservation rules
✅ Quality control enforcement

### **Fail-Safe Design:**
- If Guard System fails → Generation proceeds with basic prompt
- If primary AI fails → Error logged, stats updated
- Database errors → Don't break generation flow

---

## 🧪 **Testing**

### **Test Individual Providers:**
```javascript
// Test Stability
const { generateWithStability } = require('./providers/stability');
const result = await generateWithStability({
  prompt: "test prompt",
  apiKey: "sk-..."
});

// Test MiniMax
const { generateWithMiniMax } = require('./providers/minimax');
// ... similar pattern
```

### **Test Guard System:**
```javascript
const AIGuardService = require('./services/aiGuardService');
const service = new AIGuardService(GenerationGuardRule);

const { executionPrompt, negativePrompt } = await service.buildExecutionPrompt({
  userPrompt: "luxury car",
  templatePrompt: "Photo of {prompt}",
  generationType: "text_to_image"
});

console.log(executionPrompt); // Should include guard rules
```

---

## 📝 **Admin Panel Integration**

### **AI Config Section:**
1. **AI Models Configuration**
   - Add/Edit AI providers
   - Set API keys
   - Toggle active status

2. **AI Guard System & Safety Rules**
   - View all guard rules
   - Create custom rules
   - Set priorities
   - Enable/disable rules
   - Seed default safety rules

### **User Flow:**
```
User uploads photo → Selects template → Enters prompt
↓
Backend: Merges prompt + template + guard rules
↓
Sends to active AI provider
↓
Returns image + saves clean prompt to DB
```

---

## 🐛 **Troubleshooting**

### **Common Issues:**

**1. "No active AI configured"**
- Solution: Go to Admin Panel → AI Config → Enable an AI model

**2. "API key not configured"**
- Solution: Edit AI model → Add valid API key

**3. "Stability multipart/form-data error"**
- Solution: Ensure `form-data` package is installed
- Run: `npm install form-data@4.0.0`

**4. "Guard rules not applying"**
- Solution: Seed default rules via Admin Panel
- Or manually create rules in database

**5. "MiniMax timeout"**
- Solution: MiniMax is async - Wait 10-30 seconds
- Check console logs for polling status

---

## 📚 **Further Reading**

- [Stability API Docs](https://platform.stability.ai/docs)
- [Gemini API Docs](https://ai.google.dev/gemini-api/docs/image-generation)
- [MiniMax API Docs](https://www.minimax.io/)
- [Replicate API Docs](https://replicate.com/docs)
- [OpenAI API Docs](https://platform.openai.com/docs)

---

## 🎯 **Recommended Setup for Production**

1. **Primary AI:** MiniMax (best face preservation + cost)
2. **Backup AI:** Replicate + Flux (highest quality)
3. **Guard Rules:** Enable all 4 default rules
4. **Monitoring:** Track success rates in Admin Panel
5. **Scaling:** Use PM2 cluster mode for high traffic

---

**Built with ❤️ for Rupantar AI**
