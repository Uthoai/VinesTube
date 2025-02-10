import mongoose, {Schema} from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

const userSchema = new mongoose.Schema(
    {
        username: {
            Types: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            index: true
        },
        email: {
            Types: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        fullName: {
            Types: String,
            required: true,
            trim: true,
            index: true
        },
        avatar: {
            Types: String,
            required: true
        },
        coverImage: {
            Types: String
        },
        watchHistory: [
            {
                Types: Schema.Types.ObjectId,
                ref: "Video"
            }
        ],
        password: {
            Types: String,
            required: true,
        },
        refreshToken: {
            Types: String
        },
    },
    {
        timeseries: true
    }
);

userSchema.pre("save", async function (next){
    if(!this.isModified("password")) return next();
    
    this.password = await bcrypt.hash(this.password, 10)
    next()
})

userSchema.methods.isPasswordCorrect = async function (password) {
    return await bcrypt.compare(password, this.password)
}

userSchema.methods.generateAccessToken = async function (){
    return jwt.sign(
        {
            _id: this._id,
            email: this.email,
            username: this.username,
            fullName: this.fullName
        },
        process.env.ACCESS_TOKEN_SECRET,
        {
            expiresIn: process.env.ACCESS_TOKEN_EXPIRY
        }
    )
}

userSchema.methods.generateRefreshToken = async function (){
    return jwt.sign(
        {
            _id: this._id
        },
        process.env.REFRESH_TOKEN,
        {
            expiresIn: process.env.REFRESH_TOKEN_EXPIRY
        }
    )
}

export const User = mongoose.model("User", userSchema);
 
