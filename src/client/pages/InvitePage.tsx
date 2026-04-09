import React, { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';

export function InvitePage() {
  const { token = '' } = useParams();
  const nav = useNavigate();
  useEffect(() => {
    api.acceptInvite(token)
      .then((r) => nav(`/communities/${r.communityId}`))
      .catch((e) => alert(e.message));
  }, [token, nav]);
  return <div className="container"><div className="loading">招待を受諾中…</div></div>;
}
