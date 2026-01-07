/**
 * AI GUARD SYSTEM & SAFETY RULES
 * 
 * This service merges:
 * 1. User Prompt
 * 2. Template Prompt  
 * 3. AI Guard Rules (hidden system prompts)
 * 
 * Rules are applied in priority order and are NEVER exposed to users.
 */

class AIGuardService {
    constructor(GuardRuleModel) {
        this.GuardRuleModel = GuardRuleModel;
    }

    /**
     * Main function: Merge all prompts according to rules
     * @returns {executionPrompt, negativePrompt, userPrompt}
     */
    async buildExecutionPrompt({ userPrompt, templatePrompt, generationType }) {
        try {
            // Fetch active guard rules
            const rules = await this.GuardRuleModel.find({ enabled: true })
                .sort({ priority: 1 })  // Lower number = higher priority
                .lean();

            console.log(`🛡️ AI Guard: Found ${rules.length} active rules`);

            // Filter rules applicable to this generation type
            const applicableRules = rules.filter(rule => {
                if (!rule.applyTo || rule.applyTo.length === 0) return true;
                return rule.applyTo.includes(generationType) || rule.applyTo.includes('all');
            });

            console.log(`✅ AI Guard: ${applicableRules.length} rules apply to ${generationType}`);

            // Start with user prompt + template prompt
            let basePrompt = userPrompt || '';
            if (templatePrompt) {
                basePrompt = templatePrompt.replace('{prompt}', userPrompt || '');
            }

            // Collect system prompts and negative prompts
            const systemPrompts = [];
            const negativePrompts = [];

            for (const rule of applicableRules) {
                if (!rule.hiddenPrompt || rule.hiddenPrompt.trim() === '') continue;

                switch (rule.ruleType) {
                    case 'face_preserve':
                    case 'quality_control':
                    case 'custom':
                        // Prepend as system instruction
                        systemPrompts.push(rule.hiddenPrompt);
                        console.log(`📝 Added ${rule.ruleType} rule: ${rule.ruleName}`);
                        break;

                    case 'safety_nsfw':
                        // Add as positive instruction (not negative)
                        systemPrompts.push(rule.hiddenPrompt);
                        console.log(`🔒 Added safety rule: ${rule.ruleName}`);
                        break;

                    case 'negative_prompt':
                        // Collect for negative prompt
                        negativePrompts.push(rule.hiddenPrompt);
                        console.log(`⛔ Added negative prompt: ${rule.ruleName}`);
                        break;
                }
            }

            // Build final execution prompt
            // Format: [System Instructions] + Base Prompt
            let executionPrompt = basePrompt;

            if (systemPrompts.length > 0) {
                const systemInstructions = systemPrompts.join('. ');
                executionPrompt = `${systemInstructions}. ${basePrompt}`;
            }

            const finalNegativePrompt = negativePrompts.join(', ');

            console.log(`🎯 Final Execution Prompt Length: ${executionPrompt.length} chars`);
            console.log(`⛔ Final Negative Prompt: ${finalNegativePrompt || 'None'}`);

            return {
                executionPrompt,      // Sent to AI (includes hidden rules)
                negativePrompt: finalNegativePrompt,
                userPrompt: basePrompt  // Saved to DB (no hidden rules)
            };

        } catch (error) {
            console.error('❌ AI Guard Error:', error);

            // Fail-open: If guard system fails, still allow generation
            console.warn('⚠️ AI Guard failed - proceeding with basic prompt');

            let basePrompt = userPrompt || '';
            if (templatePrompt) {
                basePrompt = templatePrompt.replace('{prompt}', userPrompt || '');
            }

            return {
                executionPrompt: basePrompt,
                negativePrompt: '',
                userPrompt: basePrompt
            };
        }
    }

    /**
     * Seed default safety rules
     */
    async seedDefaultRules() {
        try {
            const existingCount = await this.GuardRuleModel.countDocuments();

            if (existingCount > 0) {
                console.log('✅ Guard rules already exist');
                return { message: 'Rules already seeded', count: existingCount };
            }

            const defaultRules = [
                {
                    ruleName: 'NSFW & Safety Block',
                    ruleType: 'safety_nsfw',
                    enabled: true,
                    priority: 0,  // Highest priority
                    hiddenPrompt: 'Generate safe, appropriate, family-friendly content. No violence, nudity, gore, or explicit content. Maintain professional and respectful tone.',
                    applyTo: ['image', 'image_to_image', 'text_to_image']
                },
                {
                    ruleName: 'Face Preservation',
                    ruleType: 'face_preserve',
                    enabled: true,
                    priority: 1,
                    hiddenPrompt: 'Preserve the exact facial features, skin tone, hair, eyes, and identity of the person in the reference image. Maintain face accuracy at 95% similarity.',
                    applyTo: ['image_to_image']
                },
                {
                    ruleName: 'Global Negative Prompt',
                    ruleType: 'negative_prompt',
                    enabled: true,
                    priority: 2,
                    hiddenPrompt: 'ugly, deformed, distorted, blurry, low quality, amateur, watermark, text, signature, bad anatomy, extra limbs',
                    applyTo: ['image', 'image_to_image', 'text_to_image']
                },
                {
                    ruleName: 'Quality Enhancement',
                    ruleType: 'quality_control',
                    enabled: true,
                    priority: 3,
                    hiddenPrompt: 'Generate high-quality, professional-grade image with sharp details, proper lighting, and realistic textures. 4K resolution, photorealistic style.',
                    applyTo: ['image', 'image_to_image', 'text_to_image']
                }
            ];

            const created = await this.GuardRuleModel.insertMany(defaultRules);
            console.log(`✅ Created ${created.length} default guard rules`);

            return {
                message: 'Default rules seeded successfully',
                count: created.length,
                rules: created
            };

        } catch (error) {
            console.error('❌ Error seeding guard rules:', error);
            throw error;
        }
    }
}

module.exports = AIGuardService;
