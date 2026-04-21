#include <bits/stdc++.h>
using namespace std;
#define fast {ios_base::sync_with_stdio(false); cin.tie(0);}
typedef long long ll;
#define int long long
#define float long double
int cs;
void solve()
{
    int n,a,x,c=0,cc=0;
    cin >> n >> a;
    for(int i=1;i<=n;i++)
    {
        cin >> x;
        c+=(x>a);
        cc+=(x<a);
    }
    if(c>=cc) cout << a+1 << '\n';
    else cout << a-1 << '\n';
}
signed main()
{
    fast
    int t=1;
    cin >> t;
    for(cs=1;cs<=t;cs++)
    {
        //cout << "Case " << cs << ": ";
        solve();
    }
    return 0;
}