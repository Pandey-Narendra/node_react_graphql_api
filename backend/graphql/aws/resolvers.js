const bcrypt = require('bcryptjs');
const validator = require('validator');
const jwt = require('jsonwebtoken');

const User = require('../../models/user');
const Post = require('../../models/post');
const { deleteFromS3 } = require('../../util/s3'); // S3 helper

module.exports = {
    createUser: async ({ userInput }, context) => {
        const errors = [];
        if (!validator.isEmail(userInput.email)) errors.push({ message: 'E-Mail is invalid.' });
        if (validator.isEmpty(userInput.password) || !validator.isLength(userInput.password, { min: 5 }))
            errors.push({ message: 'Password too short!' });

        if (errors.length > 0) {
            const error = new Error('Invalid input.');
            error.data = errors;
            error.code = 422;
            throw error;
        }

        const existingUser = await User.findOne({ email: userInput.email });
        if (existingUser) throw new Error('User exists already!');

        const hashedPw = await bcrypt.hash(userInput.password, 12);
        const user = new User({
            email: userInput.email,
            name: userInput.name,
            password: hashedPw,
        });
        const createdUser = await user.save();
        return { ...createdUser._doc, _id: createdUser._id.toString() };
    },

    login: async ({ email, password }) => {
        const user = await User.findOne({ email });
        if (!user) {
            const error = new Error('User not found.');
            error.code = 401;
            throw error;
        }
        const isEqual = await bcrypt.compare(password, user.password);
        if (!isEqual) {
            const error = new Error('Password is incorrect.');
            error.code = 401;
            throw error;
        }

        const token = jwt.sign(
            { userId: user._id.toString(), email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        return { token, userId: user._id.toString() };
    },

    // createPost: async ({ postInput, file }, context) => {
    //     if (!context.isAuth) throw new Error('Not authenticated!');

    //     const errors = [];
    //     if (!postInput.title || postInput.title.length < 5) errors.push({ message: 'Title is invalid.' });
    //     if (!postInput.content || postInput.content.length < 5) errors.push({ message: 'Content is invalid.' });
    //     if (errors.length > 0) {
    //         const error = new Error('Invalid input.');
    //         error.data = errors;
    //         error.code = 422;
    //         throw error;
    //     }

    //     const user = await User.findById(context.authUserId);
    //     if (!user) throw new Error('Invalid user.');

    //     // Upload file to S3
    //     let imageUrl = postInput.imageUrl;
    //     if (file) {
    //         imageUrl = await file.uploadToS3(); // implement file helper for Lambda
    //     }

    //     const post = new Post({
    //         title: postInput.title,
    //         content: postInput.content,
    //         imageUrl,
    //         creator: user,
    //     });
    //     const createdPost = await post.save();
    //     user.posts.push(createdPost);
    //     await user.save();

    //     return {
    //         ...createdPost._doc,
    //         _id: createdPost._id.toString(),
    //         createdAt: createdPost.createdAt.toISOString(),
    //         updatedAt: createdPost.updatedAt.toISOString(),
    //     };
    // },

    createPost: async ({ postInput, file }, context) => {
        if (!context.isAuth) throw new Error('Not authenticated!');

        const errors = [];
        if (!postInput.title || postInput.title.length < 5) errors.push({ message: 'Title is invalid.' });
        if (!postInput.content || postInput.content.length < 5) errors.push({ message: 'Content is invalid.' });
        if (errors.length > 0) {
            const error = new Error('Invalid input.');
            error.data = errors;
            error.code = 422;
            throw error;
        }

        const user = await User.findById(context.authUserId);
        if (!user) throw new Error('Invalid user.');

        // Upload file to S3 if provided
        let imageUrl = postInput.imageUrl || '';
        if (file) {
            imageUrl = await uploadToS3(file, process.env.AWS_BUCKET_NAME);
        }

        const post = new Post({
            title: postInput.title,
            content: postInput.content,
            imageUrl,
            creator: user,
        });

        const createdPost = await post.save();
        user.posts.push(createdPost);
        await user.save();

        return {
            ...createdPost._doc,
            _id: createdPost._id.toString(),
            createdAt: createdPost.createdAt.toISOString(),
            updatedAt: createdPost.updatedAt.toISOString(),
        };
    },

    posts: async ({ page }, context) => {
        if (!context.isAuth) throw new Error('Not authenticated!');
        if (!page) page = 1;
        const perPage = 2;
        const totalPosts = await Post.find().countDocuments();
        const posts = await Post.find()
            .sort({ createdAt: -1 })
            .skip((page - 1) * perPage)
            .limit(perPage)
            .populate('creator');

        return {
            posts: posts.map(p => ({
                ...p._doc,
                _id: p._id.toString(),
                createdAt: p.createdAt.toISOString(),
                updatedAt: p.updatedAt.toISOString(),
            })),
            totalPosts,
        };
    },

    post: async ({ id }, context) => {
        if (!context.isAuth) throw new Error('Not authenticated!');
        const post = await Post.findById(id).populate('creator');
        if (!post) throw new Error('No post found!');
        return { ...post._doc, _id: post._id.toString(), createdAt: post.createdAt.toISOString(), updatedAt: post.updatedAt.toISOString() };
    },

    // updatePost: async ({ id, postInput, file }, context) => {
    //     if (!context.isAuth) throw new Error('Not authenticated!');
    //     const post = await Post.findById(id).populate('creator');
    //     if (!post) throw new Error('No post found!');
    //     if (post.creator._id.toString() !== context.authUserId.toString()) throw new Error('Not authorized!');

    //     post.title = postInput.title || post.title;
    //     post.content = postInput.content || post.content;

    //     if (file) {
    //         if (post.imageUrl) await deleteFromS3(post.imageUrl);
    //         post.imageUrl = await file.uploadToS3();
    //     }

    //     const updatedPost = await post.save();
    //     return { ...updatedPost._doc, _id: updatedPost._id.toString(), createdAt: updatedPost.createdAt.toISOString(), updatedAt: updatedPost.updatedAt.toISOString() };
    // },

    updatePost: async ({ id, postInput, file }, context) => {
        if (!context.isAuth) throw new Error('Not authenticated!');

        const post = await Post.findById(id).populate('creator');
        if (!post) throw new Error('No post found!');
        if (post.creator._id.toString() !== context.authUserId.toString()) throw new Error('Not authorized!');

        post.title = postInput.title || post.title;
        post.content = postInput.content || post.content;

        if (file) {
            // Delete old image from S3 if exists
            if (post.imageUrl) await deleteFromS3(post.imageUrl);

            // Upload new image to S3
            post.imageUrl = await uploadToS3(file, process.env.AWS_BUCKET_NAME);
        }

        const updatedPost = await post.save();
        return {
            ...updatedPost._doc,
            _id: updatedPost._id.toString(),
            createdAt: updatedPost.createdAt.toISOString(),
            updatedAt: updatedPost.updatedAt.toISOString(),
        };
    },

    deletePost: async ({ id }, context) => {
        if (!context.isAuth) throw new Error('Not authenticated!');
        const post = await Post.findById(id);
        if (!post) throw new Error('No post found!');
        if (post.creator.toString() !== context.authUserId.toString()) throw new Error('Not authorized!');
        if (post.imageUrl) await deleteFromS3(post.imageUrl);

        await Post.findByIdAndRemove(id);
        const user = await User.findById(context.authUserId);
        user.posts.pull(id);
        await user.save();
        return true;
    },

    user: async (args, context) => {
        if (!context.isAuth) throw new Error('Not authenticated!');
        const user = await User.findById(context.authUserId);
        if (!user) throw new Error('No user found!');
        return { ...user._doc, _id: user._id.toString() };
    },

    updateStatus: async ({ status }, context) => {
        if (!context.isAuth) throw new Error('Not authenticated!');
        const user = await User.findById(context.authUserId);
        if (!user) throw new Error('No user found!');
        user.status = status;
        await user.save();
        return { ...user._doc, _id: user._id.toString() };
    },
};
