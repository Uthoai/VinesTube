import {asyneHandler} from "../utils/asyneHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import validator from 'validator';
import {uploadOnCloudinary, deleteFromCloudinary} from "../utils/cloudinary.js";
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
    
        const user = await User.findById(decodedToken?._id).select("-password")
    
        if (!user) {
            throw new ApiError(401, "Invalid refresh token");
        }

        if (incomingRefreshToken !== user?.refreshToken) {
            throw new ApiError(401, "Refresh token is expired or used")
        }
    
        // generate new access and refresh token
        const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user._id);
    
        const options = {
            httpOnly: true,
            secure: true
        }
    
        return res.status(200)
        .cookie("accessToken", accessToken, options)    
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(
                200, 
                {
                    accessToken, refreshToken
                },
                "Access token refreshed"
            )
        )
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh token")
    }

})

// Change Current Password
const changeCurrentPassword = asyneHandler( async (req, res) => {
    const {oldPassword, newPassword} = req.body

    const user = await User.findById(req.user?._id)
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)

    if (!isPasswordCorrect) {
        throw new ApiError(400, "Invalid old password")
    }

    user.password = newPassword
    await user.save({ validateBeforeSave: false })

    return res.status(200)
    .json(
        new ApiResponse(200,{}, "password change successfully")
    )
})

// get current user
const getCurrentUser = asyneHandler( async (req, res) => {
    return res.status(200)
    .json(new ApiResponse(
        200, 
        req.user, 
        "user fetched successfully"
    ))
})

// Update Account Details
const updateAccountDetails = asyneHandler( async (req, res) => {
    const { fullName, email} = req.body

    if (!fullName || !email) {
        throw new ApiError(400, "All fields are required.")
    }

    const user = await User.findByIdAndUpdate(
        req.user._id,
        {
            $set:{
                fullName: fullName,
                email: email
            }
            // set is mongodb operator 
        },
        {
            new: true   // this is for when update is complete object will return 
        }
    ).select("-password")

    return res.status(200)
    .json(new ApiResponse(
        200,
        user,
        "Account details updated successfully"
    ))
})

// update user avatar
const updateUserAvatar = asyneHandler(async (req, res) => {
    const avatarLocalPath = req.file?.path

    if (!avatarLocalPath) {
        throw new ApiError(400,"Avatar file is missing.")
    }

    // Delete old avatar from Cloudinary if it exists
    if (req.user.avatar) {
        const publicId = req.user.avatar.split('/').pop().split('.')[0];
        await deleteFromCloudinary(publicId); 
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath);

    if (!avatar.url) {
        throw new ApiError(400,"Error while uploading on avatar")
    }

    const user = await User.findByIdAndUpdate(
        req.user._id,
        {
            $set:{
                avatar: avatar.url
            }
        },
        {
            new: true
        }
    ).select("-password")

    return res.status(200)
    .json(new ApiResponse(
        200,
        user,
        "avater update successfully."
    ))
})

// update user cover image
const updateUserCoverImage = asyneHandler(async (req, res) => {
    const coverImageLocalPath = req.file?.path

    if (!coverImageLocalPath) {
        throw new ApiError(400,"CoverImage file is missing.")
    }

    // Delete old coverImage from Cloudinary if it exists
    if (req.user.coverImage) {
        const publicId = req.user.coverImage.split('/').pop().split('.')[0];
        await deleteFromCloudinary(publicId); 
    }

    const coverImage = await uploadOnCloudinary(coverImageLocalPath);

    if (!coverImage.url) {
        throw new ApiError(400,"Error while uploading on coverImage")
    }

    const user = await User.findByIdAndUpdate(
        req.user._id,
        {
            $set:{
                coverImage: coverImage.url
            }
        },
        {
            new: true
        }
    ).select("-password")

    return res.status(200)
    .json(new ApiResponse(
        200,
        user,
        "cover image update successfully."
    ))
})

// get user channel profile
const getUserChannelProfile = asyneHandler( async (req, res) => {
    const {username} = req.params

    if (!username?.trim()) {
        throw new ApiError(400, "username is missing")
    }

    //User.find({username})

    const channel = await User.aggregate([
        {
            $match: {
                username: username?.toLowerCase()
            }
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "channel",
                as: "subscribers"
            }
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "subscriber",
                as: "subscribedTo"
            }
        },
        {
            $addFields: {
                subscribersCount:{
                    $size: "$subscribers"
                },
                channelSubscribedToCount:{
                    $size: "$subscribedTo"
                },
                isSubscribed:{
                    $cond: {
                        if: {$in: [req.user?._id, "$subscribers.subscriber"]},
                        then: true,
                        else: false
                    }
                }
            }
        },
        {
            $project: {
                username: 1,
                email: 1,
                fullName: 1,
                avatar: 1,
                coverImage: 1,
                subscribersCount: 1,
                channelSubscribedToCount: 1,
                isSubscribed: 1,
            }
        }
    ])

    console.log("Channel: ",channel);
    
    if (!channel?.length) {
        throw new ApiError(400, "channel does not exist");
    }

    return res.status(200)
    .json(new ApiResponse(400, channel[0], "Channel fetched successfully."))
})

export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage,
    getUserChannelProfile
}


