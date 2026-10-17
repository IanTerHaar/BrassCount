import { AccessibilityInfo } from 'react-native';

import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useAnnounce } from '../src/hooks/useAnnounce';

const Announcer = ({ message }: { message: string | null }) => {
  useAnnounce(message);
  return null;
};

describe('useAnnounce', () => {
  let announce: jest.SpyInstance;
  let tree: ReactTestRenderer;

  const render = (message: string | null) => {
    act(() => {
      tree.update(<Announcer message={message} />);
    });
  };

  beforeEach(() => {
    announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    // The preset's own mock is reused, so calls from an earlier test linger.
    announce.mockClear();
    act(() => {
      tree = create(<Announcer message={null} />);
    });
  });

  afterEach(() => {
    act(() => tree.unmount());
    jest.restoreAllMocks();
  });

  it('says nothing while there is no message', () => {
    render(null);

    expect(announce).not.toHaveBeenCalled();
  });

  it('says a message once when it appears', () => {
    render('Could not load');
    render('Could not load');

    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('Could not load');
  });

  it('says it again after it went away and came back', () => {
    render('Could not load');
    render(null);
    render('Could not load');

    expect(announce).toHaveBeenCalledTimes(2);
  });

  it('says a different message when it changes', () => {
    render('Loading');
    render('Could not load');

    expect(announce.mock.calls).toEqual([['Loading'], ['Could not load']]);
  });
});
