import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { withRouter } from 'react-router';
import kebabCase from 'lodash/kebabCase';
import debounce from 'lodash/debounce';
import isArray from 'lodash/isArray';
import 'url-search-params-polyfill';
import { injectIntl } from 'react-intl';

import {
  getAuthenticatedUser,
  getDraftPosts,
  getIsEditorLoading,
  getIsEditorSaving,
} from '../../reducers';

import * as Actions from '../../actions/constants';
import { createPost, saveDraft, newPost } from './editorActions';
import { notify } from '../../app/Notification/notificationActions';
import EditorBlog from '../../components/Editor/EditorBlog';
import Affix from '../../components/Utils/Affix';

const version = require('../../../package.json').version;

// @UTOPIAN
import { getBeneficiaries } from '../../actions/beneficiaries';
import GithubConnection from '../../components/Sidebar/GithubConnection';

@injectIntl
@withRouter
@connect(
  state => ({
    user: getAuthenticatedUser(state),
    draftPosts: getDraftPosts(state),
    loading: getIsEditorLoading(state),
    saving: getIsEditorSaving(state),
    submitting: state.loading,
    project: state.project,
  }),
  {
    createPost,
    saveDraft,
    newPost,
    notify,
    getBeneficiaries,
  },
)
class WriteBlog extends React.Component {
  static propTypes = {
    intl: PropTypes.shape().isRequired,
    user: PropTypes.shape().isRequired,
    draftPosts: PropTypes.shape().isRequired,
    loading: PropTypes.bool.isRequired,
    saving: PropTypes.bool,
    location: PropTypes.shape().isRequired,
    newPost: PropTypes.func,
    createPost: PropTypes.func,
    saveDraft: PropTypes.func,
    notify: PropTypes.func,
  };

  static defaultProps = {
    saving: false,
    newPost: () => {},
    createPost: () => {},
    saveDraft: () => {},
    notify: () => {},
  };

  constructor(props) {
    super(props);
    this.state = {
      initialTitle: '',
      initialTopics: [],
      initialReward: '50',
      initialType: '',
      initialBody: '',
      isUpdating: false,
      parsedPostData: null,
    };
  }

  componentDidMount() {
    this.props.newPost();
    const { draftPosts, location: { search } } = this.props;
    const draftId = new URLSearchParams(search).get('draft');
    const draftPost = draftPosts[draftId];

    if (draftPost) {
      const { jsonMetadata, isUpdating } = draftPost;
      let tags = [];
      if (isArray(jsonMetadata.tags)) {
        tags = jsonMetadata.tags;
      }

      if (draftPost.permlink) {
        this.permlink = draftPost.permlink;
      }

      if (draftPost.originalBody) {
        this.originalBody = draftPost.originalBody;
      }

      // eslint-disable-next-line
      this.setState({
        initialTitle: draftPost.title || '',
        initialTopics: tags || [],
        initialReward: draftPost.reward || '50',
        initialType: 'blog',
        initialBody: draftPost.body || '',
        isUpdating: isUpdating || false,
      });
    }
  }

  proceedSubmit = (data) => {
    const { getBeneficiaries } = this.props;
    const { location: { search } } = this.props;
    const id = new URLSearchParams(search).get('draft');
    if (id) {
      data.draftId = id;
    };


    getBeneficiaries(data.author).then(res => {
      if (res.response && res.response.results) {
        const allBeneficiaries = res.response.results;
        const beneficiaries = [
          ...allBeneficiaries.map(beneficiary => {
            let assignedWeight = 0;
            if (beneficiary.vesting_shares) { // this is a sponsor
              const sponsorSharesPercent = beneficiary.percentage_total_vesting_shares;
              // 20% of all the rewards dedicated to sponsors
              const sponsorsDedicatedWeight = 2000;
              assignedWeight = Math.round((sponsorsDedicatedWeight * sponsorSharesPercent ) / 100);
            } else {
              // this is a moderator
              const moderatorSharesPercent = beneficiary.percentage_total_rewards_moderators;
              // 5% all the rewards dedicated to moderators
              // This does not sum up. The total ever taken from an author is 20%
              const moderatorsDedicatedWeight = 500;
              assignedWeight = Math.round((moderatorsDedicatedWeight * moderatorSharesPercent ) / 100);
            }

            return {
              account: beneficiary.account,
              weight: assignedWeight || 1
            }
          })
        ];

        const extensions = [[0, {
          beneficiaries
        }]];

        const contributionData = {
          ...data,
          extensions
        };

        console.log("ANNOUNCEMENT DATA", contributionData);

        this.props.createPost(contributionData);

      } else {
        alert("Something went wrong. Please try again!");
      }
    });
  };

  onSubmit = (form) => {
    const data = this.getNewPostData(form);
    const { location: { search } } = this.props;
    const id = new URLSearchParams(search).get('draft');
    if (id) {
      data.draftId = id;
    };

    this.proceedSubmit(data);
  };

  getNewPostData = (form) => {
    const data = {
      body: form.body,
      title: form.title,
      reward: form.reward,
    };

    data.parentAuthor = '';
    data.author = this.props.user.name || '';

    const tags = [process.env.UTOPIAN_CATEGORY, ...form.topics];

    const users = [];
    const userRegex = /@([a-zA-Z.0-9-]+)/g;
    const links = [];
    const linkRegex = /\[.+?]\((.*?)\)/g;
    const images = [];
    const imageRegex = /!\[.+?]\((.*?)\)/g;
    let matches;

    const postBody = data.body;

    // eslint-disable-next-line
    while ((matches = userRegex.exec(postBody))) {
      if (users.indexOf(matches[1]) === -1) {
        users.push(matches[1]);
      }
    }

    // eslint-disable-next-line
    while ((matches = linkRegex.exec(postBody))) {
      if (links.indexOf(matches[1]) === -1 && matches[1].search(/https?:\/\//) === 0) {
        links.push(matches[1]);
      }
    }

    // eslint-disable-next-line
    while ((matches = imageRegex.exec(postBody))) {
      if (images.indexOf(matches[1]) === -1 && matches[1].search(/https?:\/\//) === 0) {
        images.push(matches[1]);
      }
    }

    if (data.title && !this.permlink) {
      data.permlink = kebabCase(data.title);
    } else {
      data.permlink = this.permlink;
    }

    if (this.state.isUpdating) data.isUpdating = this.state.isUpdating;

    const metaData = {
      community: 'utopian',
      app: `utopian/${version}`,
      format: 'markdown',
      type: 'blog',
    };

    if (tags.length) {
      metaData.tags = tags;
    }
    if (users.length) {
      metaData.users = users;
    }
    if (links.length) {
      metaData.links = links;
    }
    if (images.length) {
      metaData.image = images;
    }

    data.parentPermlink = process.env.UTOPIAN_CATEGORY; // @UTOPIAN forcing category
    data.jsonMetadata = metaData;

    if (this.originalBody) {
      data.originalBody = this.originalBody;
    }

    return data;
  };

  handleImageInserted = (blob, callback, errorCallback) => {
    const { formatMessage } = this.props.intl;
    this.props.notify(
      formatMessage({ id: 'notify_uploading_image', defaultMessage: 'Uploading image' }),
      'info',
    );
    const formData = new FormData();
    formData.append('files', blob);

    fetch(`https://busy-img.herokuapp.com/@${this.props.user.name}/uploads`, {
      method: 'POST',
      body: formData,
    })
      .then(res => res.json())
      .then(res => callback(res.secure_url, blob.name))
      .catch(() => {
        errorCallback();
        this.props.notify(
          formatMessage({
            id: 'notify_uploading_iamge_error',
            defaultMessage: "Couldn't upload image",
          }),
        );
      });
  };

  saveDraft = debounce((form) => {
    const projectId = this.props.match.params.projectId;
    const data = this.getNewPostData(form);
    const postBody = data.body;
    const { location: { search } } = this.props;
    let id = new URLSearchParams(search).get('draft');

    // Remove zero width space
    const isBodyEmpty = postBody.replace(/[\u200B-\u200D\uFEFF]/g, '').trim().length === 0;

    if (isBodyEmpty) return;

    let redirect = false;

    if (id === null) {
      id = Date.now().toString(16);
      redirect = true;
    }

    this.props.saveDraft({ postData: data, id, projectId, type: 'blog'}, redirect);
  }, 400);

  render() {
    const { initialTitle, initialTopics, initialType, initialBody, initialReward } = this.state;
    const { user, loading, saving, submitting } = this.props;
    const isSubmitting = submitting === Actions.CREATE_CONTRIBUTION_REQUEST || loading;

    return (
      <div className="shifted">
        <div className="post-layout container">
          <Affix className="rightContainer" stickPosition={77}>
            <div className="right">
              <GithubConnection user={user} />
            </div>
          </Affix>
          <div className="center">
            <EditorBlog
              ref={this.setForm}
              saving={saving}
              title={initialTitle}
              topics={initialTopics}
              reward={initialReward}
              type={initialType}
              body={initialBody}
              loading={isSubmitting}
              isUpdating={this.state.isUpdating}
              onUpdate={this.saveDraft}
              onSubmit={this.onSubmit}
              onImageInserted={this.handleImageInserted}
            />
          </div>
        </div>
      </div>
    );
  }
}

export default WriteBlog;
