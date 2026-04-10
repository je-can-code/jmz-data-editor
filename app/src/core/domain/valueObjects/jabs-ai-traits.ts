enum JabsAiTrait
{
  Careful = 'careful',
  Executor = 'executor',
  Reckless = 'reckless',
  Healer = 'healer',
  Leader = 'leader',
  Follower = 'follower',
}

interface JabsAiTraitsData
{
  careful: boolean;
  executor: boolean;
  reckless: boolean;
  healer: boolean;
  leader: boolean;
  follower: boolean;
}

class JabsAiTraits
  implements JabsAiTraitsData
{
  public careful: boolean;
  public executor: boolean;
  public reckless: boolean;
  public healer: boolean;
  public leader: boolean;
  public follower: boolean;

  constructor(data?: Partial<JabsAiTraitsData>)
  {
    this.careful = data?.careful ?? false;
    this.executor = data?.executor ?? false;
    this.reckless = data?.reckless ?? false;
    this.healer = data?.healer ?? false;
    this.leader = data?.leader ?? false;
    this.follower = data?.follower ?? false;
  }

  /**
   * Business Logic: Synchronizes boolean properties from an array of active trait strings.
   * Handles mutual exclusivity between Leader and Follower.
   */
  public updateFromStrings(
    newTraits: string[],
    currentTraits: string[]
  ): void
  {
    let finalTraits = [ ...newTraits ];

    // Apply Mutual Exclusivity Logic
    const hasLeader = finalTraits.includes(JabsAiTrait.Leader);
    const hasFollower = finalTraits.includes(JabsAiTrait.Follower);

    if (hasLeader && hasFollower)
    {
      const wasLeaderSelected = currentTraits.includes(JabsAiTrait.Leader);
      if (!wasLeaderSelected)
      {
        finalTraits = finalTraits.filter(t => t !== JabsAiTrait.Follower);
      }
      else
      {
        finalTraits = finalTraits.filter(t => t !== JabsAiTrait.Leader);
      }
    }

    // Update internal state
    this.careful = finalTraits.includes(JabsAiTrait.Careful);
    this.executor = finalTraits.includes(JabsAiTrait.Executor);
    this.reckless = finalTraits.includes(JabsAiTrait.Reckless);
    this.healer = finalTraits.includes(JabsAiTrait.Healer);
    this.leader = finalTraits.includes(JabsAiTrait.Leader);
    this.follower = finalTraits.includes(JabsAiTrait.Follower);
  }
}

export {
  JabsAiTrait,
  JabsAiTraits,
  JabsAiTraitsData
};
