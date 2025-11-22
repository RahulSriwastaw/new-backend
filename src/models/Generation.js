import mongoose from 'mongoose';

const generationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    prompt: {
        type: String,
        required: true,
    },
    negativePrompt: {
        type: String,
    },
    templateId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Template',
    },
    imageUrl: {
        type: String,
        required: true,
    },
    publicId: {
        type: String,
    },
    settings: {
        quality: {
            type: String,
            default: 'HD',
        },
        aspectRatio: {
            type: String,
            default: '1:1',
        },
        provider: {
            type: String,
        },
        model: {
            type: String,
        },
        faceImageUrl: {
            type: String,
        },
    },
    pointsCost: {
        type: Number,
        required: true,
    },
    status: {
        type: String,
        enum: ['completed', 'failed', 'processing'],
        default: 'completed',
    },
    isPublic: {
        type: Boolean,
        default: false,
    },
    isFavorite: {
        type: Boolean,
        default: false,
    },
    likes: {
        type: Number,
        default: 0,
    },
    downloads: {
        type: Number,
        default: 0,
    },
}, {
    timestamps: true,
});

// Indexes for performance
generationSchema.index({ userId: 1, createdAt: -1 });
generationSchema.index({ isPublic: 1, createdAt: -1 });
generationSchema.index({ templateId: 1 });
generationSchema.index({ status: 1 });

export default mongoose.model('Generation', generationSchema);
