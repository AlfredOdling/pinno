import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { Database } from '../types/supabase'
import {
  decrypt,
  getOrgId,
  getBrowserHistoryWithVendorId,
  getRootDomain,
} from './utils'

dotenv.config()

const supabase = createClient<Database>(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export const syncBrowserHistory = async ({
  encryptedData,
  userId,
}: {
  encryptedData: string
  userId: string
}) => {
  console.info('🚀  userId:', userId)
  const browserHistory = decrypt(encryptedData)
  const organization_id = await getOrgId({ userId })
  console.info('🚀  org_id:', organization_id)

  await detectUntrackedTools({
    browserHistory,
    organization_id,
  })

  await pushNewUserActivity({
    browserHistory,
    organization_id,
    userId,
  })
}

/**
 * If there is a match between the user browser history and the vendor list,
 * add new tools with the status: not_in_stack
 */
const detectUntrackedTools = async ({ browserHistory, organization_id }) => {
  let visitedRootDomains = browserHistory
    .map((visit) => getRootDomain(visit.url))
    .filter((x) => x)

  // Dedupe
  visitedRootDomains = [...new Set(visitedRootDomains)]

  const vendors = await supabase
    .from('vendors')
    .select('*')
    .in('root_domain', visitedRootDomains)

  await supabase
    .from('tools')
    .upsert(
      vendors.data.map((vendor) => ({
        vendor_id: vendor.id,
        organization_id,
        department: vendor.category,
        status: 'not_in_stack',
        is_tracking: false,
      })),
      {
        onConflict: 'vendor_id',
        ignoreDuplicates: true,
      }
    )
    .throwOnError()
}

/**
 * If there is a match between the user browser history and the tools
 * that the org is tracking, push new user_activity
 */
const pushNewUserActivity = async ({
  organization_id,
  browserHistory,
  userId,
}) => {
  const tools = await supabase
    .from('tools')
    .select('*, vendors!inner(*)') // Select the vendors associated with the tools
    .eq('is_tracking', true) // Filter the tools that the org is tracking
    .eq('organization_id', organization_id)

  const browserHistoryWithVendorId = getBrowserHistoryWithVendorId(
    browserHistory,
    tools.data,
    userId
  )

  await supabase
    .from('user_activity')
    .upsert(browserHistoryWithVendorId, {
      onConflict: 'user_id, vendor_id, last_visited',
      ignoreDuplicates: true,
    })
    .throwOnError()
}
