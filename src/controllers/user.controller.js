import {asyneHandler} from "../utils/asyneHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import validator from 'validator';
import {uploadOnCloudinary} from "../utils/cloudinary.js";
import {ApiResponse} from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";

const generateAccessAndRefreshTokens = async(userId)=>{
    try {
        const user = await User.findById(userId)
        const accessToken = await user.generateAccessToken()
        const refreshToken = await user.generateRefreshToken()

        if (!accessToken || !refreshToken) {
            throw new ApiError(409, "Failed to generate tokens");
        }

        user.refreshToken = refreshToken
        await user.save({ validateBeforeSave: false })

        return {accessToken, refreshToken}
    } catch (error) {
        throw new ApiError(500, "Something went wrong while generating access and refresh token")
    }
}

// step for registerUser:-
// get user detail from frontend
// validation - not empty
// check if user already exist: username, email
// check for images, check for avater
// upload them to cloadinary, avater
// create user object - create entry in db
// remove password and refresh token field from response
// check for user creation
// return response

const registerUser = asyneHandler( async(req, res)=>{ 
    
    const {fullName, email, username, password} = req.body
    //console.log("User data:", fullName, email, username, password );
    
    // check all field is empty or not
    if (
        [fullName, email, username, password].some((field)=> field?.trim() === "")
    ) {
        throw new ApiError(400, "All fields are required");  
    }

    // Validating email format
    if (!validator.isEmail(email)) {
        throw new ApiError(400, "Invalid email format");
    }

    // Password validation (must be at least 8 characters)
    if (password.length < 8) {
        throw new ApiError(400, "Password must be at least 8 characters long");
    }

    // check user is exist or not
    const existedUser = await User.findOne({
        $or: [{username}, {email}]
    })
    //console.log("existedUser: ", existedUser);
    
    if (existedUser) {
        throw new ApiError(409, "email /username already used.");
    }

    //console.log(req.files); // just check
    
    // check avater image path is empty or not
    const avatarLocalPath = req.files?.avatar[0]?.path;
    //const coverLocalPath =req.files?.coverImage[0]?.path;

    //console.log(avatarLocalPath);  // just check

    let coverLocalPath;
    if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
        coverLocalPath = req.files.coverImage[0].path
    }

    if (!avatarLocalPath) {
        throw new ApiError(400,"avater is required.")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath);
    const coverImage = await uploadOnCloudinary(coverLocalPath);

    if (!avatar) {
        throw new ApiError(400,"avater is required.")
    }

    // create user
    const user = await User.create({
        fullName: fullName,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email: email,
        username: username.toLowerCase(),
        password: password,
    })

    // Avoid -password -refreshToken to response
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )

    if (!createdUser) {
        throw new ApiError(500, "Something went wrong while register in server..")
    }

    
    return res.status(201).json(
        new ApiResponse(200, createdUser, "User registered Successfully")
    )

})

// login->
// req body - data
// validation - not empty
// check username/email exist
// password check
// access and refresh token
// send token through cookie
// return response

const loginUser = asyneHandler( async(req, res)=>{
    const {email, username, password} = req.body

    // check field is empty or not
    if (!(email || username)) {
        throw new ApiError(400, "email/username is required")
    }

    // check user exist or not
    const user = await User.findOne({
        $or: [{email},{username}]
    })

    //console.log("UserS1:",user);

    if (!user) {
        throw new ApiError(400, "User don't exist.")
    }

    // check password is valid
    const isPasswordValid = await user.isPasswordCorrect(password)

    if (!isPasswordValid) {
        throw new ApiError(404, "Password incorrect")
    }

    // access and refresh token
    const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user._id);

    // log in user
    const loggendInUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )

    //console.log("UserS2:",loggendInUser);
    
    // send cookie
    const options = {
        httpOnly: true,
        secure: true,
    }

    return res.status(200)
    .cookie("accessToken", accessToken, options)    
    .cookie("refreshToken", refreshToken, options)
    .json(
        new ApiResponse(
            200, 
            {
                user: loggendInUser, accessToken, refreshToken
                // again access and refresh token sent because in mobile app can't set cookie
            },
            "User logged In successfully"
        )
    )

})

// logout
const logoutUser = asyneHandler( async(req, res)=>{
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                refreshToken: undefined
            }
        },
        {
            new: true
        }
    )

    const options = {
        httpOnly: true,
        secure: true
    }

    return res.status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(
        new ApiResponse(200, {}, "User logout successfully")
    )
})

// refresh Access Token
const refreshAccessToken = asyneHandler( async (req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

    if (!incomingRefreshToken) {
        throw new ApiError(401, "unauthorized request")
    }

    try {
        const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET)
    
        const user = await User.findById(decodedToken?._id).select("-password -refreshToken")
    
        if (!user) {
            throw new ApiError(401, "Invalid refresh token");
        }
    
        if (incomingRefreshToken !== user?.refreshToken) {
            throw new ApiError(401, "Refresh token is expired or used")
        }
    
        // generate new access and refresh token
        const { accessToken, newRefreshToken } = await generateAccessAndRefreshTokens(user._id);
    
        const options = {
            httpOnly: true,
            secure: true
        }
    
        return res.status(200)
        .cookie("accessToken", accessToken, options)    
        .cookie("refreshToken", newRefreshToken, options)
        .json(
            new ApiResponse(
                200, 
                {
                    accessToken, newRefreshToken
                },
                "Access token refreshed"
            )
        )
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh token")
    }

})

export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken
}


