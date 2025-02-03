import mongoose, {Schema} from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const videoSchema = new mongoose.Schema(
    {
        owner:{
            Types: Schema.Types.ObjectId,
            ref: "User"
        },
        videoFile:{
            Types: String,
            required: true
        },
        thumbnail:{
            Types: String,
            required: true
        },
        title:{
            Types: String,
            required: true
        },
        description:{
            Types: String,
            required: true
        },
        duration:{
            Types: Number, 
            required: true
        },
        views:{
            Types: Number,
            default: 0
        },
        isPublished:{
            Types: Boolean,
            default: true
        }
    },
    {
        timestamps: true
    }
)

videoSchema.plugin(mongooseAggregatePaginate);


export const VIDEO = mongoose.model("Video", videoSchema);