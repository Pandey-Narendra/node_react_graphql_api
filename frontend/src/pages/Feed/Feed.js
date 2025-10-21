import React, { useState, useEffect, Fragment } from 'react';

import Post from '../../components/Feed/Post/Post';
import Button from '../../components/Button/Button';
import FeedEdit from '../../components/Feed/FeedEdit/FeedEdit';
import Input from '../../components/Form/Input/Input';
import Paginator from '../../components/Paginator/Paginator';
import Loader from '../../components/Loader/Loader';
import ErrorHandler from '../../components/ErrorHandler/ErrorHandler';
import './Feed.css';

const Feed = ({ token }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [posts, setPosts] = useState([]);
  const [totalPosts, setTotalPosts] = useState(0);
  const [editPost, setEditPost] = useState(null);
  const [status, setStatus] = useState('');
  const [postPage, setPostPage] = useState(1);
  const [postsLoading, setPostsLoading] = useState(true);
  const [editLoading, setEditLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchStatus = async () => {
      const graphqlQuery = {
        query: `
          {
            user {
              status
            }
          }
        `
      };

      try {
        const res = await fetch(`${process.env.REACT_APP_API_URL}/graphql`, {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(graphqlQuery)
        });
        const resData = await res.json();
        if (resData.errors) throw new Error('Fetching status failed!');
        setStatus(resData.data.user.status);
      } catch (err) {
        setError(err);
      }
    };

    const loadInitialPosts = () => loadPosts();

    fetchStatus();
    loadInitialPosts();
  }, [token]);

  const loadPosts = async (direction) => {
    if (direction) {
      setPostsLoading(true);
      setPosts([]);
    }

    let page = postPage;
    if (direction === 'next') page++;
    if (direction === 'previous') page--;

    setPostPage(page);

    const graphqlQuery = {
      query: `
        query FetchPosts($page: Int) {
          posts(page: $page) {
            posts {
              _id
              title
              content
              imageUrl
              creator { name }
              createdAt
            }
            totalPosts
          }
        }
      `,
      variables: { page }
    };

    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/graphql`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(graphqlQuery)
      });
      const resData = await res.json();
      if (resData.errors) throw new Error('Fetching posts failed!');

      setPosts(
        resData.data.posts.posts.map(post => ({ ...post, imagePath: post.imageUrl }))
      );
      setTotalPosts(resData.data.posts.totalPosts);
      setPostsLoading(false);
    } catch (err) {
      setError(err);
      setPostsLoading(false);
    }
  };

  const statusUpdateHandler = async (event) => {
    event.preventDefault();
    const graphqlQuery = {
      query: `
        mutation UpdateUserStatus($userStatus: String!) {
          updateStatus(status: $userStatus) { status }
        }
      `,
      variables: { userStatus: status }
    };

    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/graphql`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(graphqlQuery)
      });
      const resData = await res.json();
      if (resData.errors) throw new Error('Updating status failed!');
    } catch (err) {
      setError(err);
    }
  };

  const startEditPostHandler = (postId) => {
    const loadedPost = posts.find(p => p._id === postId);
    setIsEditing(true);
    setEditPost(loadedPost);
  };

  const cancelEditHandler = () => {
    setIsEditing(false);
    setEditPost(null);
  };

  const finishEditHandler = async (postData) => {
    setEditLoading(true);

    const formData = new FormData();
    formData.append('image', postData.image);
    if (editPost) formData.append('oldPath', editPost.imagePath);

    try {
      const imageRes = await fetch(`${process.env.REACT_APP_API_URL}/post-image`, {
        method: 'PUT',
        headers: { Authorization: 'Bearer ' + token },
        body: formData
      });
      const fileResData = await imageRes.json();
      if (!fileResData.fileUrl) throw new Error('Image upload failed');

      let graphqlQuery;
      if (editPost) {
        graphqlQuery = {
          query: `
            mutation UpdateExistingPost($postId: ID!, $title: String!, $content: String!, $imageUrl: String!) {
              updatePost(id: $postId, postInput: {title: $title, content: $content, imageUrl: $imageUrl}) {
                _id
                title
                content
                imageUrl
                creator { name }
                createdAt
              }
            }
          `,
          variables: {
            postId: editPost._id,
            title: postData.title,
            content: postData.content,
            imageUrl: fileResData.fileUrl
          }
        };
      } else {
        graphqlQuery = {
          query: `
            mutation CreateNewPost($title: String!, $content: String!, $imageUrl: String!) {
              createPost(postInput: {title: $title, content: $content, imageUrl: $imageUrl}) {
                _id
                title
                content
                imageUrl
                creator { name }
                createdAt
              }
            }
          `,
          variables: {
            title: postData.title,
            content: postData.content,
            imageUrl: fileResData.fileUrl
          }
        };
      }

      const postRes = await fetch(`${process.env.REACT_APP_API_URL}/graphql`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(graphqlQuery)
      });

      const resData = await postRes.json();
      if (resData.errors) throw new Error('Post operation failed');

      const resDataField = editPost ? 'updatePost' : 'createPost';
      const newPost = {
        ...resData.data[resDataField],
        imagePath: resData.data[resDataField].imageUrl
      };

      setPosts(prevPosts => {
        let updatedPosts = [...prevPosts];
        let updatedTotalPosts = totalPosts;
        if (editPost) {
          const postIndex = prevPosts.findIndex(p => p._id === editPost._id);
          updatedPosts[postIndex] = newPost;
        } else {
          updatedTotalPosts++;
          if (prevPosts.length >= 2) updatedPosts.pop();
          updatedPosts.unshift(newPost);
        }
        setTotalPosts(updatedTotalPosts);
        return updatedPosts;
      });

      setIsEditing(false);
      setEditPost(null);
      setEditLoading(false);
    } catch (err) {
      console.error(err);
      setError(err);
      setIsEditing(false);
      setEditPost(null);
      setEditLoading(false);
    }
  };

  const statusInputChangeHandler = (input, value) => {
    setStatus(value);
  };

  const deletePostHandler = async (postId) => {
    setPostsLoading(true);
    const graphqlQuery = {
      query: `
        mutation {
          deletePost(id: "${postId}")
        }
      `
    };

    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/graphql`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(graphqlQuery)
      });
      const resData = await res.json();
      if (resData.errors) throw new Error('Deleting the post failed!');
      loadPosts();
    } catch (err) {
      console.error(err);
      setPostsLoading(false);
    }
  };

  return (
    <Fragment>
      <ErrorHandler error={error} onHandle={() => setError(null)} />
      <FeedEdit
        editing={isEditing}
        selectedPost={editPost}
        loading={editLoading}
        onCancelEdit={cancelEditHandler}
        onFinishEdit={finishEditHandler}
      />
      <section className="feed__status">
        <form onSubmit={statusUpdateHandler}>
          <Input
            type="text"
            placeholder="Your status"
            control="input"
            onChange={statusInputChangeHandler}
            value={status}
          />
          <Button mode="flat" type="submit">
            Update
          </Button>
        </form>
      </section>
      <section className="feed__control">
        <Button mode="raised" design="accent" onClick={() => setIsEditing(true)}>
          New Post
        </Button>
      </section>
      <section className="feed">
        {postsLoading && (
          <div style={{ textAlign: 'center', marginTop: '2rem' }}>
            <Loader />
          </div>
        )}
        {posts.length <= 0 && !postsLoading && (
          <p style={{ textAlign: 'center' }}>No posts found.</p>
        )}
        {!postsLoading && (
          <Paginator
            onPrevious={() => loadPosts('previous')}
            onNext={() => loadPosts('next')}
            lastPage={Math.ceil(totalPosts / 2)}
            currentPage={postPage}
          >
            {posts.map(post => (
              <Post
                key={post._id}
                id={post._id}
                author={post.creator.name}
                date={new Date(post.createdAt).toLocaleDateString('en-US')}
                title={post.title}
                image={post.imagePath}
                content={post.content}
                onStartEdit={() => startEditPostHandler(post._id)}
                onDelete={() => deletePostHandler(post._id)}
              />
            ))}
          </Paginator>
        )}
      </section>
    </Fragment>
  );
};

export default Feed;
