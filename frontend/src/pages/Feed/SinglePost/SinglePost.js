import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

import Image from '../../../components/Image/Image';
import './SinglePost.css';

const SinglePost = ({ token }) => {
  const { postId } = useParams();
  const [post, setPost] = useState({
    title: '',
    author: '',
    date: '',
    image: '',
    content: ''
  });

  useEffect(() => {
    const fetchPost = async () => {
      const graphqlQuery = {
        query: `
          query FetchSinglePost($postId: ID!) {
            post(id: $postId) {
              title
              content
              imageUrl
              creator { name }
              createdAt
            }
          }
        `,
        variables: { postId }
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
        if (resData.errors) throw new Error('Fetching post failed!');

        setPost({
          title: resData.data.post.title,
          author: resData.data.post.creator.name,
          image: resData.data.post.imageUrl,
          date: new Date(resData.data.post.createdAt).toLocaleDateString('en-US'),
          content: resData.data.post.content
        });
      } catch (err) {
        console.error(err);
      }
    };

    fetchPost();
  }, [postId, token]);

  return (
    <section className="single-post">
      <h1>{post.title}</h1>
      <h2>
        Created by {post.author} on {post.date}
      </h2>
      <div className="single-post__image">
        <Image contain imageUrl={post.image} />
      </div>
      <p>{post.content}</p>
    </section>
  );
};

export default SinglePost;
