import { useEffect, useState } from 'react';
import { api } from '../api';

// One status request per page load, shared by every header. The link appears only once the channel is public.
let statusRequest = null;

export function useLinearChannelPublic() {
  const [isPublic, setIsPublic] = useState(false);
  useEffect(() => {
    let active = true;
    statusRequest ||= api.getLinearChannelStatus().catch(() => ({ public: false }));
    statusRequest.then((status) => { if (active) setIsPublic(status?.public === true); });
    return () => { active = false; };
  }, []);
  return isPublic;
}
