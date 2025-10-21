import React, { useState } from 'react';

import Input from '../../components/Form/Input/Input';
import Button from '../../components/Button/Button';
import { required, length, email as emailValidator } from '../../util/validators';
import Auth from './Auth';

const Signup = ({ onSignup, loading }) => {
  const [signupForm, setSignupForm] = useState({
    email: { value: '', valid: false, touched: false, validators: [required, emailValidator] },
    name: { value: '', valid: false, touched: false, validators: [required] },
    password: { value: '', valid: false, touched: false, validators: [required, length({ min: 5 })] },
    formIsValid: false
  });

  const inputChangeHandler = (input, value) => {
    setSignupForm(prevState => {
      let isValid = true;
      for (const validator of prevState[input].validators) {
        isValid = isValid && validator(value);
      }

      const updatedForm = {
        ...prevState,
        [input]: {
          ...prevState[input],
          value,
          valid: isValid
        }
      };

      let formIsValid = true;
      for (const inputName in updatedForm) {
        if (updatedForm[inputName].validators) {
          formIsValid = formIsValid && updatedForm[inputName].valid;
        }
      }

      return { ...updatedForm, formIsValid };
    });
  };

  const inputBlurHandler = input => {
    setSignupForm(prevState => ({
      ...prevState,
      [input]: {
        ...prevState[input],
        touched: true
      }
    }));
  };

  const submitHandler = e => {
    e.preventDefault();
    onSignup(e, { signupForm });
  };

  return (
    <Auth>
      <form onSubmit={submitHandler}>
        <Input
          id="email"
          label="Your E-Mail"
          type="email"
          control="input"
          onChange={inputChangeHandler}
          onBlur={() => inputBlurHandler('email')}
          value={signupForm.email.value}
          valid={signupForm.email.valid}
          touched={signupForm.email.touched}
        />
        <Input
          id="name"
          label="Your Name"
          type="text"
          control="input"
          onChange={inputChangeHandler}
          onBlur={() => inputBlurHandler('name')}
          value={signupForm.name.value}
          valid={signupForm.name.valid}
          touched={signupForm.name.touched}
        />
        <Input
          id="password"
          label="Password"
          type="password"
          control="input"
          onChange={inputChangeHandler}
          onBlur={() => inputBlurHandler('password')}
          value={signupForm.password.value}
          valid={signupForm.password.valid}
          touched={signupForm.password.touched}
        />
        <Button design="raised" type="submit" loading={loading}>
          Signup
        </Button>
      </form>
    </Auth>
  );
};

export default Signup;
